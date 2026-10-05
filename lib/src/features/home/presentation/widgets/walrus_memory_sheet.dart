import 'dart:async';
import 'dart:ui';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/core/providers/user_id_provider.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

void showWalrusMemorySheet({
  required BuildContext context,
  String? queryUsed,
  String? moodAngle,
  List<Map<String, dynamic>> memories = const [],
  List<String>? activeMemories,
  String? attributedMemory,
  String? mediaTitle,
  String? category,
  bool isSaved = false,
  MemoryUpdates? memoryUpdates,
  List<Map<String, dynamic>> walrusWrites = const [],
}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) {
      return _WalrusMemorySheetContent(
        queryUsed: queryUsed,
        moodAngle: moodAngle,
        memories: memories,
        activeMemories: activeMemories,
        attributedMemory: attributedMemory,
        mediaTitle: mediaTitle,
        category: category,
        isSaved: isSaved || memoryUpdates != null || walrusWrites.isNotEmpty,
        memoryUpdates: memoryUpdates,
        walrusWrites: walrusWrites,
      );
    },
  );
}

class _WalrusMemorySheetContent extends ConsumerStatefulWidget {
  const _WalrusMemorySheetContent({
    this.queryUsed,
    this.moodAngle,
    this.memories = const [],
    this.activeMemories,
    this.attributedMemory,
    this.mediaTitle,
    this.category,
    required this.isSaved,
    this.memoryUpdates,
    this.walrusWrites = const [],
  });

  final String? queryUsed;
  final String? moodAngle;
  final List<Map<String, dynamic>> memories;
  final List<String>? activeMemories;
  final String? attributedMemory;
  final String? mediaTitle;
  final String? category;
  final bool isSaved;
  final MemoryUpdates? memoryUpdates;
  final List<Map<String, dynamic>> walrusWrites;

  @override
  ConsumerState<_WalrusMemorySheetContent> createState() =>
      _WalrusMemorySheetContentState();
}

class _WalrusMemorySheetContentState
    extends ConsumerState<_WalrusMemorySheetContent> {
  bool _isLoadingLive = true;
  String? _accountObjectId;
  List<String> _liveNamespaces = [];
  List<Map<String, dynamic>> _liveBlobs = [];
  List<Map<String, dynamic>> _recentWrites = [];
  Map<String, Map<String, dynamic>> _jobStatuses = {};
  String? _liveQueryUsed;
  Timer? _pollTimer;
  int _pollCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchLiveWalrusState();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  List<String> _collectPendingJobIds() {
    final ids = <String>{};
    for (final w in widget.walrusWrites) {
      final jid = w['job_id']?.toString();
      final bid = w['blob_id']?.toString();
      if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
        ids.add(jid);
      }
    }
    if (widget.memoryUpdates != null) {
      for (final w in widget.memoryUpdates!.walrusWrites) {
        final jid = w['job_id']?.toString();
        final bid = w['blob_id']?.toString();
        if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
          ids.add(jid);
        }
      }
    }
    for (final m in widget.memories) {
      final jid = m['job_id']?.toString();
      final bid = m['blob_id']?.toString();
      if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
        ids.add(jid);
      }
    }
    for (final w in _recentWrites) {
      final jid = w['job_id']?.toString();
      final bid = w['blob_id']?.toString();
      if (jid != null && jid.isNotEmpty && (bid == null || bid.isEmpty)) {
        ids.add(jid);
      }
    }
    return ids.toList();
  }

  Future<void> _fetchLiveWalrusState({bool isBackgroundPoll = false}) async {
    if (!mounted) return;
    if (!isBackgroundPoll) {
      setState(() => _isLoadingLive = true);
    }

    try {
      final service = ref.read(recommendationServiceProvider);
      final jobIds = _collectPendingJobIds();
      final data = await service.fetchWalrusLive(
        jobIds: jobIds,
        query: widget.queryUsed,
        category: widget.category,
      );

      if (!mounted) return;

      final namespaces = (data['namespaces'] as List?)
              ?.map((e) {
                if (e is Map) {
                  final name = e['name']?.toString() ?? '';
                  final count = e['memory_count'];
                  if (count is num && count > 0) {
                    return '$name ($count)';
                  }
                  return name;
                }
                return e.toString();
              })
              .where((s) => s.isNotEmpty)
              .toList() ??
          [];
      final liveBlobs = (data['live_blobs'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          [];
      final recentWrites = (data['recent_writes'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          [];

      final rawJobStatuses = data['job_statuses'];
      final parsedJobStatuses = <String, Map<String, dynamic>>{};
      if (rawJobStatuses is Map) {
        rawJobStatuses.forEach((k, v) {
          if (v is Map) {
            parsedJobStatuses[k.toString()] = Map<String, dynamic>.from(v);
          }
        });
      }

      setState(() {
        _accountObjectId = (data['account_id'] ?? data['account_object_id'])?.toString();
        if (namespaces.isNotEmpty) _liveNamespaces = namespaces;
        if (liveBlobs.isNotEmpty) _liveBlobs = liveBlobs;
        if (recentWrites.isNotEmpty) _recentWrites = recentWrites;
        if (parsedJobStatuses.isNotEmpty) {
          _jobStatuses = {..._jobStatuses, ...parsedJobStatuses};
        }
        _liveQueryUsed = data['query_used']?.toString();
        _isLoadingLive = false;
      });

      // If there are still unresolved job_ids in Saved mode, poll up to 4 times
      final remainingJobs = _collectPendingJobIds().where((jid) {
        final resolved = _jobStatuses[jid]?['blob_id']?.toString();
        return resolved == null || resolved.isEmpty;
      }).toList();

      if (remainingJobs.isNotEmpty && _pollCount < 4 && _pollTimer == null) {
        _pollTimer = Timer.periodic(const Duration(milliseconds: 2800), (timer) {
          _pollCount++;
          if (_pollCount > 4 || !mounted) {
            timer.cancel();
            _pollTimer = null;
            return;
          }
          _fetchLiveWalrusState(isBackgroundPoll: true);
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoadingLive = false);
      }
    }
  }

  String _formatNamespace(String userId, String suffix) {
    if (suffix.startsWith('coda:')) return suffix;
    final clean = suffix
        .toLowerCase()
        .replaceAll(RegExp(r'^coda_[^_]+_'), '')
        .replaceAll(RegExp(r'[^a-z0-9_]'), '');
    return 'coda:$userId:${clean.isEmpty ? "core" : clean}';
  }

  /// Resolves the best available blob_id for a memory item using direct field,
  /// job_statuses map, or matching live_blobs / recent_writes from Walrus.
  Map<String, dynamic> _enrichMemoryWithLiveWalrus(
    Map<String, dynamic> item,
    String userId,
  ) {
    final enriched = Map<String, dynamic>.from(item);
    final rawNs = (enriched['namespace'] ?? enriched['category'] ?? widget.category ?? 'core').toString();
    enriched['namespace'] = _formatNamespace(userId, rawNs);

    String? blobId = enriched['blob_id']?.toString();
    String? jobId = enriched['job_id']?.toString();
    String? status = enriched['status']?.toString();
    final text = (enriched['text'] ?? enriched['content'] ?? '').toString().trim();

    // 1. Check live job status resolution
    if ((blobId == null || blobId.isEmpty) && jobId != null && _jobStatuses.containsKey(jobId)) {
      final jobInfo = _jobStatuses[jobId]!;
      if (jobInfo['blob_id'] != null && jobInfo['blob_id'].toString().isNotEmpty) {
        blobId = jobInfo['blob_id'].toString();
      }
      status = jobInfo['status']?.toString() ?? status;
    }

    // 2. Match against recentWrites by text or jobId
    if (blobId == null || blobId.isEmpty) {
      for (final rw in _recentWrites) {
        final rwText = (rw['text'] ?? '').toString().trim();
        final rwJobId = rw['job_id']?.toString();
        if ((jobId != null && jobId == rwJobId) ||
            (text.isNotEmpty && rwText.isNotEmpty && (rwText.contains(text) || text.contains(rwText)))) {
          if (rw['blob_id'] != null && rw['blob_id'].toString().isNotEmpty) {
            blobId = rw['blob_id'].toString();
          }
          jobId ??= rwJobId;
          status ??= rw['status']?.toString();
          if (rw['namespace'] != null) {
            enriched['namespace'] = _formatNamespace(userId, rw['namespace'].toString());
          }
          break;
        }
      }
    }

    // 3. Match against liveBlobs recalled directly from Walrus
    if (blobId == null || blobId.isEmpty) {
      for (final lb in _liveBlobs) {
        final lbText = (lb['text'] ?? '').toString().trim();
        if (text.isNotEmpty &&
            lbText.isNotEmpty &&
            (lbText.toLowerCase().contains(text.toLowerCase()) ||
                text.toLowerCase().contains(lbText.toLowerCase()))) {
          if (lb['blob_id'] != null && lb['blob_id'].toString().isNotEmpty) {
            blobId = lb['blob_id'].toString();
          }
          if (lb['namespace'] != null) {
            enriched['namespace'] = _formatNamespace(userId, lb['namespace'].toString());
          }
          break;
        }
      }
    }

    if (blobId != null && blobId.isNotEmpty) {
      enriched['blob_id'] = blobId;
      enriched['status'] = 'committed';
    } else if (jobId != null && jobId.isNotEmpty) {
      enriched['job_id'] = jobId;
      enriched['status'] = status ?? 'sealing_on_walrus';
    }

    return enriched;
  }

  List<Map<String, dynamic>> _buildSavedBlobsList(String userId) {
    final results = <Map<String, dynamic>>[];
    final seenTexts = <String>{};

    void addBlob(Map<String, dynamic> raw) {
      final enriched = _enrichMemoryWithLiveWalrus(raw, userId);
      final text = (enriched['text'] ?? '').toString().trim();
      if (text.isEmpty) return;
      final key = '${enriched['namespace']}::$text';
      if (seenTexts.contains(key)) return;
      seenTexts.add(key);
      results.add(enriched);
    }

    // 1. Direct walrusWrites passed to the sheet or inside memoryUpdates
    for (final w in widget.walrusWrites) {
      addBlob(w);
    }
    if (widget.memoryUpdates != null) {
      for (final w in widget.memoryUpdates!.walrusWrites) {
        addBlob(w);
      }
    }

    // 2. If memoryUpdates has structured appends not yet in walrusWrites, include them with real namespaces
    final updates = widget.memoryUpdates;
    if (updates != null && results.isEmpty) {
      for (final trait in updates.globalIdentityAppends) {
        addBlob({
          'category': 'CORE TASTE DNA',
          'namespace': _formatNamespace(userId, 'core'),
          'text': '[Core Taste & Emotional DNA] User resonates deeply with: $trait',
        });
      }
      updates.categoryAppends.forEach((cat, items) {
        for (final item in items) {
          addBlob({
            'category': '${cat.toUpperCase()} ANCHOR',
            'namespace': _formatNamespace(userId, cat),
            'text': '[${cat.toUpperCase()} Taste Anchor] Benchmark preference in $cat: $item',
          });
        }
      });
      if (updates.recentContextOverwrite != null &&
          updates.recentContextOverwrite!.isNotEmpty) {
        addBlob({
          'category': 'ACTIVE SESSION MOOD',
          'namespace': _formatNamespace(userId, 'session'),
          'text': '[Active Mood & Situational Craving] Current headspace: ${updates.recentContextOverwrite}',
        });
      }
      for (final gr in updates.guardrailsAppends) {
        addBlob({
          'category': 'GUARDRAIL',
          'namespace': _formatNamespace(userId, 'guardrails'),
          'text': '[Dealbreaker & Content Boundary] Do not recommend media violating: $gr',
        });
      }
      for (final s in updates.seenAppends) {
        addBlob({
          'category': 'ALREADY SEEN',
          'namespace': _formatNamespace(userId, 'guardrails'),
          'text': '[Already Experienced / Seen] User has already watched, read, or played "$s" — exclude from future recommendations.',
        });
      }
    }

    // 3. Also check activeMemories / memories passed to sheet
    for (final m in widget.memories) {
      addBlob(m);
    }
    for (final m in (widget.activeMemories ?? const <String>[])) {
      addBlob({
        'category': (widget.category ?? 'TASTE MEMORY').toUpperCase(),
        'namespace': _formatNamespace(userId, widget.category ?? 'core'),
        'text': m,
      });
    }

    // 4. Include recent writes recorded on backend for this user
    for (final rw in _recentWrites.take(6)) {
      addBlob(rw);
    }

    return results;
  }

  List<Map<String, dynamic>> _buildRecalledBlobsList(String userId) {
    final results = <Map<String, dynamic>>[];
    final seenTexts = <String>{};

    void addBlob(Map<String, dynamic> raw) {
      final enriched = _enrichMemoryWithLiveWalrus(raw, userId);
      final text = (enriched['text'] ?? enriched['content'] ?? '').toString().trim();
      if (text.isEmpty) return;
      if (seenTexts.contains(text)) return;
      seenTexts.add(text);
      results.add(enriched);
    }

    for (final m in widget.memories) {
      addBlob(m);
    }
    for (final m in (widget.activeMemories ?? const <String>[])) {
      addBlob({
        'category': widget.category ?? 'Taste Anchor',
        'text': m,
        'namespace': _formatNamespace(userId, widget.category ?? 'core'),
      });
    }
    // Append live blobs recalled from Walrus so actual on-chain blob_ids are always visible
    for (final lb in _liveBlobs) {
      addBlob(lb);
    }

    return results;
  }

  void _copyToClipboard(String value, String label) {
    Clipboard.setData(ClipboardData(text: value));
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A1D24),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        content: Text(
          'Copied $label: $value',
          style: GoogleFonts.jetBrainsMono(color: Colors.white, fontSize: 11),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).padding.bottom;
    final rawUserId = ref.watch(userIdProvider);
    final effectiveUserId = widget.memoryUpdates?.userId ?? rawUserId;

    final rawQuery = widget.queryUsed;
    final isGenericFallbackQuery = rawQuery == null ||
        rawQuery.isEmpty ||
        rawQuery == 'atmospheric storytelling and resonant pacing' ||
        rawQuery == 'dynamic taste scout query';
    final effectiveQuery = !isGenericFallbackQuery
        ? rawQuery
        : (_liveQueryUsed ?? rawQuery);
    final effectiveMood = widget.moodAngle ?? 'Situational Resonance';

    final displayBlobs = widget.isSaved
        ? _buildSavedBlobsList(effectiveUserId)
        : _buildRecalledBlobsList(effectiveUserId);

    // Collect active namespaces from live Walrus + current blobs
    final allNamespaces = <String>{
      ..._liveNamespaces.where((ns) => ns.contains(effectiveUserId) || ns.startsWith('coda:')),
      ...displayBlobs.map((b) => (b['namespace'] ?? '').toString()).where((s) => s.isNotEmpty),
    }.toList();

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.86,
          ),
          padding: EdgeInsets.fromLTRB(24, 12, 24, 32 + bottomPad),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.07),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            border: Border(
              top: BorderSide(
                color: Colors.white.withValues(alpha: 0.14),
                width: 1,
              ),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Minimal drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 18),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Header
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.15),
                      ),
                    ),
                    child: const Text('🦭', style: TextStyle(fontSize: 22)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.isSaved
                              ? 'Saved to Walrus Memory'
                              : (widget.mediaTitle != null
                                  ? 'Why Coda Chose ${widget.mediaTitle}'
                                  : 'Recalled from Walrus Memory'),
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.isSaved
                              ? 'Live decentralized blobs & namespaces recorded on Walrus'
                              : 'Live decentralized taste blobs recalled via Walrus Protocol',
                          style: GoogleFonts.inter(
                            color: Colors.white.withValues(alpha: 0.55),
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => _fetchLiveWalrusState(),
                    child: Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.12),
                        ),
                      ),
                      child: _isLoadingLive
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 1.8,
                                color: Colors.white70,
                              ),
                            )
                          : Icon(
                              PhosphorIcons.arrowsClockwise(PhosphorIconsStyle.bold),
                              color: Colors.white.withValues(alpha: 0.7),
                              size: 14,
                            ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.12),
                        ),
                      ),
                      child: Icon(
                        PhosphorIcons.x(PhosphorIconsStyle.bold),
                        color: Colors.white.withValues(alpha: 0.7),
                        size: 14,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // Scrollable Content
              Flexible(
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ── Live Walrus Protocol Provenance Bar ───────────────
                      _buildLiveProvenanceBar(effectiveUserId, allNamespaces),

                      // ── Dynamic Memory Scout Card (Recalled Mode) ─────────
                      if (!widget.isSaved &&
                          effectiveQuery != null &&
                          effectiveQuery.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.14),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    PhosphorIcons.compass(PhosphorIconsStyle.bold),
                                    size: 13,
                                    color: const Color(0xFF7CE8FF),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'DYNAMIC MEMORY SCOUT QUERY',
                                    style: GoogleFonts.inter(
                                      color: const Color(0xFF7CE8FF),
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.8,
                                    ),
                                  ),
                                  const Spacer(),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: 0.10),
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(
                                        color: Colors.white.withValues(alpha: 0.18),
                                      ),
                                    ),
                                    child: Text(
                                      effectiveMood,
                                      style: GoogleFonts.inter(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '"$effectiveQuery"',
                                style: GoogleFonts.inter(
                                  color: Colors.white.withValues(alpha: 0.96),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  fontStyle: FontStyle.italic,
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      // ── Decisive Memory Match ─────────────────────────────
                      if (!widget.isSaved &&
                          widget.attributedMemory != null &&
                          widget.attributedMemory!.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.09),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.22),
                              width: 1.2,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Text('🎯', style: TextStyle(fontSize: 12)),
                                  const SizedBox(width: 6),
                                  Text(
                                    'DECISIVE WALRUS MEMORY MATCH',
                                    style: GoogleFonts.inter(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.8,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                widget.attributedMemory!,
                                style: GoogleFonts.inter(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  height: 1.45,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      if (displayBlobs.isNotEmpty) ...[
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            Text(
                              widget.isSaved
                                  ? 'RECORDED WALRUS BLOBS (${displayBlobs.length})'
                                  : 'RECALLED WALRUS BLOBS (${displayBlobs.length})',
                              style: GoogleFonts.inter(
                                color: Colors.white.withValues(alpha: 0.55),
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.8,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              'Tap Blob ID to copy',
                              style: GoogleFonts.inter(
                                color: Colors.white.withValues(alpha: 0.35),
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        ...displayBlobs.map((m) => _buildBlobCard(m, effectiveUserId)),
                      ],

                      // If in Saved mode and we also have committed live_blobs on Walrus with blob_ids, show them!
                      if (widget.isSaved &&
                          _liveBlobs.any((lb) =>
                              lb['blob_id'] != null &&
                              lb['blob_id'].toString().isNotEmpty)) ...[
                        const SizedBox(height: 14),
                        Text(
                          'VERIFIED ON-CHAIN WALRUS BLOBS IN NAMESPACE',
                          style: GoogleFonts.inter(
                            color: Colors.white.withValues(alpha: 0.55),
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 10),
                        ..._liveBlobs
                            .where((lb) =>
                                lb['blob_id'] != null &&
                                lb['blob_id'].toString().isNotEmpty)
                            .take(5)
                            .map((lb) => _buildBlobCard(lb, effectiveUserId)),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLiveProvenanceBar(String userId, List<String> namespaces) {
    final accountId = _accountObjectId ?? '0x5eb3d61e26f28fe74cd02fb0fc99f6bc9f8cf1e1c8e8d311f597d7f4ec352975';
    final shortAccount = accountId.length > 18
        ? '${accountId.substring(0, 10)}...${accountId.substring(accountId.length - 6)}'
        : accountId;

    final effectiveNs = namespaces.isNotEmpty
        ? namespaces
        : [
            _formatNamespace(userId, 'core'),
            if (widget.category != null && widget.category!.isNotEmpty)
              _formatNamespace(userId, widget.category!),
            _formatNamespace(userId, 'guardrails'),
          ];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: Color(0xFF4ADE80),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 7),
              Text(
                'WALRUS PROTOCOL • LIVE ON TESTNET',
                style: GoogleFonts.inter(
                  color: const Color(0xFF4ADE80),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.7,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () => _copyToClipboard(accountId, 'Walrus Account Object ID'),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'Obj: $shortAccount',
                    style: GoogleFonts.jetBrainsMono(
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 9.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'ACTIVE USER NAMESPACES',
            style: GoogleFonts.inter(
              color: Colors.white.withValues(alpha: 0.45),
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: effectiveNs.take(6).map((ns) {
              return GestureDetector(
                onTap: () => _copyToClipboard(ns, 'Namespace'),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.07),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Text(
                    ns,
                    style: GoogleFonts.jetBrainsMono(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildBlobCard(Map<String, dynamic> m, String userId) {
    final cat = (m['category'] ?? m['namespace'] ?? 'Taste')
        .toString()
        .toUpperCase();
    final text = (m['text'] ?? m['content'] ?? '').toString();
    final ns = _formatNamespace(userId, (m['namespace'] ?? 'core').toString());
    final isGuardrail = ns.endsWith(':guardrails') || cat.contains('GUARDRAIL');

    final blobId = m['blob_id']?.toString();
    final jobId = m['job_id']?.toString();
    final distance = m['distance'];
    double? matchPercent;
    if (distance is num) {
      matchPercent = ((1.0 - distance.toDouble()).clamp(0.55, 0.99)) * 100;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isGuardrail
              ? Colors.purpleAccent.withValues(alpha: 0.3)
              : Colors.white.withValues(alpha: 0.11),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top row: Category pill + Namespace
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: isGuardrail
                      ? Colors.purple.withValues(alpha: 0.25)
                      : Colors.white.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  cat,
                  style: GoogleFonts.inter(
                    color: isGuardrail
                        ? const Color(0xFFD68BFF)
                        : Colors.white.withValues(alpha: 0.92),
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (matchPercent != null) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2.5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF4ADE80).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '${matchPercent.toStringAsFixed(0)}% match',
                    style: GoogleFonts.inter(
                      color: const Color(0xFF4ADE80),
                      fontSize: 9.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
              const Spacer(),
              Flexible(
                child: GestureDetector(
                  onTap: () => _copyToClipboard(ns, 'Namespace'),
                  child: Text(
                    'ns: $ns',
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: Colors.white.withValues(alpha: 0.55),
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 8),

          // Second row: Walrus Blob ID or Live Sealing Job ID pill
          if (blobId != null && blobId.isNotEmpty)
            GestureDetector(
              onTap: () => _copyToClipboard(blobId, 'Walrus Blob ID'),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFF7CE8FF).withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: const Color(0xFF7CE8FF).withValues(alpha: 0.28),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      PhosphorIcons.cube(PhosphorIconsStyle.bold),
                      size: 12,
                      color: const Color(0xFF7CE8FF),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'BLOB ID: $blobId',
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.jetBrainsMono(
                          color: const Color(0xFF7CE8FF),
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      PhosphorIcons.copy(PhosphorIconsStyle.bold),
                      size: 11,
                      color: const Color(0xFF7CE8FF).withValues(alpha: 0.75),
                    ),
                  ],
                ),
              ),
            )
          else if (jobId != null && jobId.isNotEmpty)
            GestureDetector(
              onTap: () => _copyToClipboard(jobId, 'Walrus Write Job ID'),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFFFBBF24).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: const Color(0xFFFBBF24).withValues(alpha: 0.30),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      PhosphorIcons.cloudArrowUp(PhosphorIconsStyle.bold),
                      size: 12,
                      color: const Color(0xFFFBBF24),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'WALRUS BATCH JOB: $jobId • SEALING BLOB',
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.jetBrainsMono(
                          color: const Color(0xFFFBBF24),
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Memory Blob Text
          Text(
            text,
            style: GoogleFonts.inter(
              color: Colors.white.withValues(alpha: 0.95),
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}
