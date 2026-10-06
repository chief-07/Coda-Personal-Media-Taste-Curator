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
    return ids.toList();
  }

  Future<void> _fetchLiveWalrusState({bool isBackgroundPoll = false}) async {
    if (!mounted) return;
    try {
      final service = ref.read(recommendationServiceProvider);
      final jobIds = _collectPendingJobIds();
      final data = await service.fetchWalrusLive(
        jobIds: jobIds,
        query: widget.queryUsed,
        category: widget.category,
      );

      if (!mounted) return;

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
        if (liveBlobs.isNotEmpty) _liveBlobs = liveBlobs;
        if (recentWrites.isNotEmpty) _recentWrites = recentWrites;
        if (parsedJobStatuses.isNotEmpty) {
          _jobStatuses = {..._jobStatuses, ...parsedJobStatuses};
        }
        _liveQueryUsed = data['query_used']?.toString();
      });

      final remainingJobs = _collectPendingJobIds().where((jid) {
        final resolved = _jobStatuses[jid]?['blob_id']?.toString();
        return resolved == null || resolved.isEmpty;
      }).toList();

      if (remainingJobs.isNotEmpty && _pollCount < 4 && _pollTimer == null) {
        _pollTimer =
            Timer.periodic(const Duration(milliseconds: 2800), (timer) {
          _pollCount++;
          if (_pollCount > 4 || !mounted) {
            timer.cancel();
            _pollTimer = null;
            return;
          }
          _fetchLiveWalrusState(isBackgroundPoll: true);
        });
      }
    } catch (_) {}
  }

  String _formatNamespace(String userId, String suffix) {
    if (suffix.startsWith('coda:')) return suffix;
    final clean = suffix
        .toLowerCase()
        .replaceAll(RegExp(r'^coda_[^_]+_'), '')
        .replaceAll(RegExp(r'[^a-z0-9_]'), '');
    return 'coda:$userId:${clean.isEmpty ? "core" : clean}';
  }

  String _shortNamespaceSegment(String rawNs, String userId) {
    final trimmed = rawNs.trim();
    final seg = trimmed.contains(':') ? trimmed.split(':').last : trimmed;
    final shortUser = _middleTruncate(userId, head: 5, tail: 4);
    return '$shortUser:$seg';
  }

  String _middleTruncate(String value, {int head = 8, int tail = 6}) {
    final clean = value.trim();
    if (clean.length <= head + tail + 3) return clean;
    return '${clean.substring(0, head)}…${clean.substring(clean.length - tail)}';
  }

  /// Strips legacy boilerplate prefixes if any older blobs are recalled.
  String _cleanMemoryText(String raw) {
    return raw
        .replaceAll(
            RegExp(r'^\[[^\]]+\]\s*(When choosing what to watch,\s*read,\s*or play,\s*the user resonates with:\s*)?',
                caseSensitive: false),
            '')
        .replaceAll(
            RegExp(r'\.\s*Recommend\s+[a-z]+\s+works matching this tone.*$',
                caseSensitive: false),
            '')
        .trim();
  }

  /// Enriches a memory item with its live blob_id/job_id from Walrus without
  /// adding unrelated blobs to the list.
  Map<String, dynamic> _enrichMemoryWithLiveWalrus(
    Map<String, dynamic> item,
    String userId,
  ) {
    final enriched = Map<String, dynamic>.from(item);
    final rawNs = (enriched['namespace'] ??
            enriched['category'] ??
            widget.category ??
            'core')
        .toString();
    enriched['namespace'] = _formatNamespace(userId, rawNs);

    String? blobId =
        (enriched['blob_id'] ?? enriched['blobId'])?.toString().trim();
    String? jobId = enriched['job_id']?.toString().trim();
    final text =
        (enriched['text'] ?? enriched['content'] ?? '').toString().trim();

    if ((blobId == null || blobId.isEmpty) &&
        jobId != null &&
        _jobStatuses.containsKey(jobId)) {
      final jobInfo = _jobStatuses[jobId]!;
      if (jobInfo['blob_id'] != null &&
          jobInfo['blob_id'].toString().isNotEmpty) {
        blobId = jobInfo['blob_id'].toString();
      }
    }

    if (blobId == null || blobId.isEmpty) {
      for (final rw in _recentWrites) {
        final rwText = (rw['text'] ?? '').toString().trim();
        final rwJobId = rw['job_id']?.toString();
        if ((jobId != null && jobId == rwJobId) ||
            (text.isNotEmpty &&
                rwText.isNotEmpty &&
                (rwText.toLowerCase() == text.toLowerCase()))) {
          if (rw['blob_id'] != null && rw['blob_id'].toString().isNotEmpty) {
            blobId = rw['blob_id'].toString();
          }
          jobId ??= rwJobId;
          break;
        }
      }
    }

    if (blobId == null || blobId.isEmpty) {
      for (final lb in _liveBlobs) {
        final lbText = (lb['text'] ?? '').toString().trim();
        if (text.isNotEmpty &&
            lbText.isNotEmpty &&
            lbText.toLowerCase() == text.toLowerCase()) {
          if (lb['blob_id'] != null && lb['blob_id'].toString().isNotEmpty) {
            blobId = lb['blob_id'].toString();
          }
          break;
        }
      }
    }

    if (blobId != null && blobId.isNotEmpty) {
      enriched['blob_id'] = blobId;
    }
    if (jobId != null && jobId.isNotEmpty) {
      enriched['job_id'] = jobId;
    }

    return enriched;
  }

  /// Builds ONLY the atomic memories saved in this turn.
  List<Map<String, dynamic>> _buildSavedBlobsList(String userId) {
    final results = <Map<String, dynamic>>[];
    final seenTexts = <String>{};

    void addBlob(Map<String, dynamic> raw) {
      final enriched = _enrichMemoryWithLiveWalrus(raw, userId);
      final rawText =
          (enriched['raw_text'] ?? enriched['text'] ?? '').toString().trim();
      final text = _cleanMemoryText(rawText);
      if (text.isEmpty) return;
      final normText = text.toLowerCase();
      if (seenTexts.contains(normText)) return;
      seenTexts.add(normText);
      enriched['display_text'] = text;
      results.add(enriched);
    }

    for (final w in widget.walrusWrites) {
      addBlob(w);
    }
    if (widget.memoryUpdates != null) {
      for (final w in widget.memoryUpdates!.walrusWrites) {
        addBlob(w);
      }
    }

    final updates = widget.memoryUpdates;
    if (updates != null && results.isEmpty) {
      for (final trait in updates.globalIdentityAppends) {
        addBlob({
          'namespace': _formatNamespace(userId, 'core'),
          'text': trait,
        });
      }
      updates.categoryAppends.forEach((cat, items) {
        for (final item in items) {
          addBlob({
            'namespace': _formatNamespace(userId, cat),
            'text': item,
          });
        }
      });
      if (updates.recentContextOverwrite != null &&
          updates.recentContextOverwrite!.trim().isNotEmpty) {
        addBlob({
          'namespace': _formatNamespace(userId, 'session'),
          'text': updates.recentContextOverwrite!.trim(),
        });
      }
      for (final gr in updates.guardrailsAppends) {
        addBlob({
          'namespace': _formatNamespace(userId, 'guardrails'),
          'text': gr,
        });
      }
      for (final s in updates.seenAppends) {
        addBlob({
          'namespace': _formatNamespace(userId, 'guardrails'),
          'text': 'Already watched: $s',
        });
      }
    }

    for (final m in widget.memories) {
      addBlob(m);
    }
    for (final m in (widget.activeMemories ?? const <String>[])) {
      addBlob({
        'namespace': _formatNamespace(userId, widget.category ?? 'core'),
        'text': m,
      });
    }

    return results;
  }

  /// Builds ONLY the spotlighted atomic memories recalled for this recommendation.
  List<Map<String, dynamic>> _buildRecalledBlobsList(String userId) {
    final results = <Map<String, dynamic>>[];
    final seenTexts = <String>{};

    void addBlob(Map<String, dynamic> raw) {
      final enriched = _enrichMemoryWithLiveWalrus(raw, userId);
      final rawText =
          (enriched['text'] ?? enriched['content'] ?? '').toString().trim();
      final text = _cleanMemoryText(rawText);
      if (text.isEmpty) return;
      final normText = text.toLowerCase();
      if (seenTexts.contains(normText)) return;
      seenTexts.add(normText);
      enriched['display_text'] = text;
      results.add(enriched);
    }

    for (final m in widget.memories) {
      addBlob(m);
    }
    for (final m in (widget.activeMemories ?? const <String>[])) {
      addBlob({
        'text': m,
        'namespace': _formatNamespace(userId, widget.category ?? 'core'),
      });
    }

    if (results.isEmpty &&
        widget.attributedMemory != null &&
        widget.attributedMemory!.trim().isNotEmpty) {
      addBlob({
        'text': widget.attributedMemory!.trim(),
        'namespace': _formatNamespace(userId, widget.category ?? 'core'),
      });
    }

    return results;
  }

  void _copyToClipboard(String value, String label) {
    final cleanValue = value.trim();
    if (cleanValue.isEmpty) return;
    Clipboard.setData(ClipboardData(text: cleanValue));
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF16181C),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        content: Text(
          'Copied $label',
          style: GoogleFonts.inter(color: Colors.white, fontSize: 12),
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

    final rawQuery = widget.queryUsed?.trim();
    final effectiveQuery = (rawQuery != null && rawQuery.isNotEmpty)
        ? rawQuery
        : _liveQueryUsed?.trim();

    final displayBlobs = widget.isSaved
        ? _buildSavedBlobsList(effectiveUserId)
        : _buildRecalledBlobsList(effectiveUserId);

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          width: double.infinity,
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.78,
          ),
          padding: EdgeInsets.fromLTRB(24, 12, 24, 36 + bottomPad),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.07),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            border: Border(
              top: BorderSide(
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 20),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Minimal Header
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.isSaved
                          ? 'Remembered on Walrus'
                          : 'Recalled from Walrus',
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        height: 1.2,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 30,
                      height: 30,
                      alignment: Alignment.center,
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
                        size: 13,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 18),

              Flexible(
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Query (Recalled mode only)
                      if (!widget.isSaved &&
                          effectiveQuery != null &&
                          effectiveQuery.isNotEmpty) ...[
                        Text(
                          'QUERY',
                          style: GoogleFonts.inter(
                            color: Colors.white.withValues(alpha: 0.45),
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.0,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          effectiveQuery,
                          style: GoogleFonts.inter(
                            color: Colors.white.withValues(alpha: 0.90),
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],

                      // Memories List
                      if (displayBlobs.isNotEmpty) ...[
                        if (!widget.isSaved) ...[
                          Text(
                            displayBlobs.length == 1 ? 'MEMORY' : 'MEMORIES',
                            style: GoogleFonts.inter(
                              color: Colors.white.withValues(alpha: 0.45),
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.0,
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                        ...displayBlobs.map(
                          (m) => _buildMinimalMemoryRow(m, effectiveUserId),
                        ),
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

  Widget _buildMinimalMemoryRow(Map<String, dynamic> m, String userId) {
    final ns = _formatNamespace(userId, (m['namespace'] ?? 'core').toString());
    final shortNs = _shortNamespaceSegment(ns, userId);
    final text =
        (m['display_text'] ?? m['text'] ?? m['content'] ?? '').toString().trim();

    final blobId = (m['blob_id'] ?? m['blobId'])?.toString().trim();
    final jobId = m['job_id']?.toString().trim();
    final hasBlobId = blobId != null && blobId.isNotEmpty;
    final hasJobId = jobId != null && jobId.isNotEmpty;

    final idLabel = hasBlobId
        ? _middleTruncate(blobId)
        : (hasJobId ? _middleTruncate(jobId) : null);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            text,
            style: GoogleFonts.inter(
              color: Colors.white.withValues(alpha: 0.94),
              fontSize: 14,
              fontWeight: FontWeight.w500,
              height: 1.42,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              GestureDetector(
                onTap: () => _copyToClipboard(ns, 'namespace'),
                child: Text(
                  shortNs,
                  style: GoogleFonts.jetBrainsMono(
                    color: Colors.white.withValues(alpha: 0.45),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              if (idLabel != null) ...[
                Text(
                  '  ·  ',
                  style: GoogleFonts.jetBrainsMono(
                    color: Colors.white.withValues(alpha: 0.30),
                    fontSize: 11,
                  ),
                ),
                GestureDetector(
                  onTap: () => _copyToClipboard(
                    hasBlobId ? blobId : jobId!,
                    hasBlobId ? 'blob ID' : 'job ID',
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        hasBlobId ? 'blob $idLabel' : 'sealing $idLabel',
                        style: GoogleFonts.jetBrainsMono(
                          color: Colors.white.withValues(alpha: 0.45),
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        PhosphorIcons.copy(PhosphorIconsStyle.regular),
                        size: 11,
                        color: Colors.white.withValues(alpha: 0.38),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
