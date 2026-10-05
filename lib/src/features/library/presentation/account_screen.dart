import 'dart:ui' as dart_ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/features/session/application/archived_sessions_controller.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:coda/src/core/providers/user_id_provider.dart';

class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _topScrollController.addListener(() {
      if (_maskScrollController.hasClients &&
          _topScrollController.offset != _maskScrollController.offset) {
        _maskScrollController.jumpTo(_topScrollController.offset);
      }
    });
  }

  @override
  void dispose() {
    _maskScrollController.dispose();
    _topScrollController.dispose();
    super.dispose();
  }

  Future<void> _switchToAccount(String targetAccountId) async {
    final currentId = ref.read(userIdProvider);
    final accounts = ref.read(userAccountsListProvider);
    String target = targetAccountId;

    // If user taps the already-active account and there are multiple accounts, cycle to next
    if (target == currentId && accounts.length > 1) {
      final idx = accounts.indexOf(currentId);
      target = accounts[(idx + 1) % accounts.length];
    } else if (target == currentId) {
      return;
    }

    ref.read(audioPlayerControllerProvider.notifier).pause();
    final isOnboarded =
        await ref.read(userIdProvider.notifier).switchToAccount(target);
    ref.invalidate(livingMemoryProvider);
    ref.invalidate(onboardingControllerProvider);
    ref.invalidate(archivedSessionsProvider);
    ref.invalidate(selectedMediaTypeProvider);
    ref.invalidate(activeSessionProvider);
    ref.invalidate(homeRecommendationProvider);

    if (!mounted) return;
    if (!isOnboarded) {
      context.go('/onboarding');
    }
  }

  void _showCreateAccountDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.5),
      builder: (dialogCtx) => BackdropFilter(
        filter: dart_ui.ImageFilter.blur(sigmaX: 15, sigmaY: 15),
        child: Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF16181C).withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.1),
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Create New Account?',
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'This will create a new account with an isolated Walrus Protocol memory namespace while keeping your current account saved.\n\nYou will go through onboarding for the new account and can cycle between all your accounts here anytime.',
                  style: GoogleFonts.inter(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogCtx),
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.inter(
                          color: Colors.white70,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () async {
                        Navigator.pop(dialogCtx);
                        ref.read(audioPlayerControllerProvider.notifier).pause();
                        await ref.read(userIdProvider.notifier).createNewAccount();
                        ref.invalidate(livingMemoryProvider);
                        ref.invalidate(onboardingControllerProvider);
                        ref.invalidate(archivedSessionsProvider);
                        ref.invalidate(selectedMediaTypeProvider);
                        ref.invalidate(activeSessionProvider);
                        ref.invalidate(homeRecommendationProvider);
                        if (context.mounted) {
                          context.go('/onboarding');
                        }
                      },
                      child: Text(
                        'Create',
                        style: GoogleFonts.inter(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showLogoutDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.5),
      builder: (dialogCtx) => BackdropFilter(
        filter: dart_ui.ImageFilter.blur(sigmaX: 15, sigmaY: 15),
        child: Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF16181C).withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.08),
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Logout?',
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Logging out will reset the local session cache for this account and return you to onboarding.',
                  style: GoogleFonts.inter(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogCtx),
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.inter(
                          color: Colors.white70,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () async {
                        Navigator.pop(dialogCtx);
                        await ref.read(livingMemoryProvider.notifier).clearMemory();
                        ref.read(audioPlayerControllerProvider.notifier).pause();
                        await ref.read(homeRecommendationProvider.notifier).clearActivePick();
                        ref.read(activeSessionProvider.notifier).clear();
                        if (context.mounted) {
                          context.go('/onboarding');
                        }
                      },
                      child: Text(
                        'Logout',
                        style: GoogleFonts.inter(
                          color: const Color(0xFFE03E3E),
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeRec = ref.watch(homeRecommendationProvider).value;
    final userId = ref.watch(userIdProvider);
    final accounts = ref.watch(userAccountsListProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          // ── Layer 0: Global Background ────────────────────────────
          Positioned.fill(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 600),
              child: activeRec != null &&
                      activeRec.posterUrl != null &&
                      activeRec.posterUrl!.isNotEmpty
                  ? Transform.scale(
                      scale: 1.2,
                      child: ImageFiltered(
                        key: ValueKey(activeRec.posterUrl),
                        imageFilter: dart_ui.ImageFilter.blur(
                          sigmaX: 80,
                          sigmaY: 80,
                          tileMode: TileMode.mirror,
                        ),
                        child: FallbackImage(
                          url: activeRec.posterUrl,
                          fit: BoxFit.cover,
                          errorWidget: const SizedBox.shrink(),
                        ),
                      ),
                    )
                  : Transform.scale(
                      scale: 1.2,
                      key: const ValueKey('default_bg'),
                      child: ImageFiltered(
                        imageFilter: dart_ui.ImageFilter.blur(
                          sigmaX: 80,
                          sigmaY: 80,
                          tileMode: TileMode.mirror,
                        ),
                        child: const Image(
                          image: AssetImage('assets/images/default_bg.jpg'),
                          fit: BoxFit.cover,
                          width: double.infinity,
                          height: double.infinity,
                        ),
                      ),
                    ),
            ),
          ),
          Positioned.fill(
            child: Container(color: Colors.white.withValues(alpha: 0.15)),
          ),

          // ── Layer 1: Full-screen Knockout mask ──────────────────────
          Positioned.fill(
            child: ShaderMask(
              shaderCallback: (Rect bounds) {
                return LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.75),
                    Colors.black.withValues(alpha: 0.75),
                    Colors.black.withValues(alpha: 0.50),
                  ],
                  stops: const [0.0, 0.65, 1.0],
                ).createShader(bounds);
              },
              blendMode: BlendMode.srcOut,
              child: Container(
                color: Colors.black.withValues(alpha: 0.01),
                child: _buildScrollableBody(
                  isKnockoutLayer: true,
                  scrollController: _maskScrollController,
                  userId: userId,
                  accounts: accounts,
                ),
              ),
            ),
          ),

          // ── Layer 2: Normal visible elements ──────────────────────
          Positioned.fill(
            child: _buildScrollableBody(
              isKnockoutLayer: false,
              scrollController: _topScrollController,
              userId: userId,
              accounts: accounts,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScrollableBody({
    required bool isKnockoutLayer,
    required ScrollController scrollController,
    required String userId,
    required List<String> accounts,
  }) {
    final activeIndex = accounts.indexOf(userId);
    final activeLabel =
        activeIndex >= 0 ? '@coda (Account ${activeIndex + 1})' : '@coda';

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          // Back Button & Title Row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                GestureDetector(
                  onTap: isKnockoutLayer ? null : () => context.pop(),
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isKnockoutLayer
                          ? Colors.black
                          : Colors.white.withValues(alpha: 0.08),
                      border: isKnockoutLayer
                          ? Border.all(color: Colors.black, width: 1.5)
                          : Border.all(
                              color: Colors.white.withValues(alpha: 0.12)),
                    ),
                    child: isKnockoutLayer
                        ? null
                        : const Icon(
                            PhosphorIconsBold.caretLeft,
                            color: Colors.white,
                            size: 20,
                          ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: isKnockoutLayer
                      ? Text(
                          'Account',
                          style: GoogleFonts.inter(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: Colors.black,
                          ),
                        )
                      : Opacity(
                          opacity: 0,
                          child: Text(
                            'Account',
                            style: GoogleFonts.inter(
                              fontSize: 24,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Main scroll area
          Expanded(
            child: ListView(
              controller: scrollController,
              physics: isKnockoutLayer
                  ? const NeverScrollableScrollPhysics()
                  : const BouncingScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 64),
              children: [
                _buildSectionHeader('ACCOUNT IDENTITY', isKnockoutLayer),
                _buildInfoRow('Account', activeLabel, isKnockoutLayer),
                _buildInfoRow('User ID', userId, isKnockoutLayer),
                _buildInfoRow(
                    'Walrus Partition', 'coda:${userId}:*', isKnockoutLayer),

                const SizedBox(height: 24),
                _buildSectionHeader(
                    'ACCOUNTS (${accounts.length})', isKnockoutLayer),
                ...accounts.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final acctId = entry.value;
                  final isCurrent = acctId == userId;
                  return _buildAccountSwitchRow(
                    index: idx,
                    accountId: acctId,
                    isCurrent: isCurrent,
                    isKnockoutLayer: isKnockoutLayer,
                    onTap: () => _switchToAccount(acctId),
                  );
                }),

                const SizedBox(height: 24),
                _buildSectionHeader('ACTIONS', isKnockoutLayer),
                if (accounts.length > 1)
                  _buildActionRow(
                    'Cycle Next Account',
                    PhosphorIconsBold.arrowsLeftRight,
                    isKnockoutLayer,
                    onTap: () => _switchToAccount(userId),
                  ),
                _buildActionRow(
                  'Create New Account',
                  PhosphorIconsBold.userPlus,
                  isKnockoutLayer,
                  onTap: () => _showCreateAccountDialog(context, ref),
                ),
                _buildActionRow(
                  'Logout',
                  PhosphorIconsBold.signOut,
                  isKnockoutLayer,
                  isDestructive: true,
                  onTap: () => _showLogoutDialog(context, ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAccountSwitchRow({
    required int index,
    required String accountId,
    required bool isCurrent,
    required bool isKnockoutLayer,
    required VoidCallback onTap,
  }) {
    final shortId = accountId.length > 14
        ? '...${accountId.substring(accountId.length - 8)}'
        : accountId;
    final label = 'Account ${index + 1}';
    final statusText = isCurrent ? 'ACTIVE  •  $shortId' : 'SWITCH  •  $shortId';

    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          isKnockoutLayer
              ? Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: Colors.black,
                    letterSpacing: 0.3,
                  ),
                )
              : Opacity(
                  opacity: isCurrent ? 0 : 0.65,
                  child: Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              isKnockoutLayer
                  ? Text(
                      statusText,
                      style: GoogleFonts.spaceMono(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Colors.black,
                      ),
                    )
                  : Text(
                      statusText,
                      style: GoogleFonts.spaceMono(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: isCurrent
                            ? Colors.white.withValues(alpha: 0.9)
                            : Colors.white.withValues(alpha: 0.55),
                      ),
                    ),
              const SizedBox(width: 10),
              isKnockoutLayer
                  ? const SizedBox(width: 20, height: 20)
                  : Icon(
                      isCurrent
                          ? PhosphorIconsBold.checkCircle
                          : PhosphorIconsBold.arrowsLeftRight,
                      color: isCurrent
                          ? Colors.white
                          : Colors.white.withValues(alpha: 0.6),
                      size: 20,
                    ),
            ],
          ),
        ],
      ),
    );

    if (isKnockoutLayer) {
      return rowContent;
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: rowContent,
    );
  }

  Widget _buildSectionHeader(String title, bool isKnockoutLayer) {
    return Padding(
      padding: const EdgeInsets.only(left: 24, right: 24, top: 20, bottom: 8),
      child: isKnockoutLayer
          ? Text(
              title,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                color: Colors.black,
                letterSpacing: 1.5,
              ),
            )
          : Opacity(
              opacity: 0.5,
              child: Text(
                title,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: 1.5,
                ),
              ),
            ),
    );
  }

  Widget _buildInfoRow(String label, String value, bool isKnockoutLayer) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          isKnockoutLayer
              ? Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Colors.black,
                    letterSpacing: 0.3,
                  ),
                )
              : Opacity(
                  opacity: 0,
                  child: Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
          Flexible(
            child: isKnockoutLayer
                ? Text(
                    value,
                    textAlign: TextAlign.end,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.spaceMono(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.black,
                    ),
                  )
                : Text(
                    value,
                    textAlign: TextAlign.end,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.spaceMono(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionRow(
    String label,
    IconData icon,
    bool isKnockoutLayer, {
    bool isDestructive = false,
    VoidCallback? onTap,
  }) {
    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          isKnockoutLayer
              ? Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: Colors.black,
                    letterSpacing: 0.5,
                  ),
                )
              : Opacity(
                  opacity: 0,
                  child: Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
          isKnockoutLayer
              ? const SizedBox(width: 24, height: 24)
              : Icon(
                  icon,
                  color: isDestructive ? const Color(0xFFE03E3E) : Colors.white,
                  size: 22,
                ),
        ],
      ),
    );

    if (onTap == null || isKnockoutLayer) {
      return rowContent;
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: rowContent,
    );
  }
}
