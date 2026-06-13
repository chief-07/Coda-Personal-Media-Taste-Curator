import 'package:flutter/widgets.dart';

/// A ScrollController that links multiple scrollable positions synchronously.
/// Whenever one scrollable position is scrolled, all other attached positions
/// are updated in the same frame without any layout lag.
class LinkedScrollController extends ScrollController {
  LinkedScrollController() {
    _coordinator = LinkedScrollCoordinator();
  }

  late final LinkedScrollCoordinator _coordinator;

  @override
  ScrollPosition createScrollPosition(
    ScrollPhysics physics,
    ScrollContext context,
    ScrollPosition? oldPosition,
  ) {
    return _coordinator.createScrollPosition(physics, context, oldPosition);
  }

  @override
  void attach(ScrollPosition position) {
    super.attach(position);
    _coordinator.attach(position);
  }

  @override
  void detach(ScrollPosition position) {
    super.detach(position);
    _coordinator.detach(position);
  }
}

class LinkedScrollCoordinator {
  final List<LinkedScrollPosition> _positions = [];
  double _pixels = 0.0;

  ScrollPosition createScrollPosition(
    ScrollPhysics physics,
    ScrollContext context,
    ScrollPosition? oldPosition,
  ) {
    return LinkedScrollPosition(
      physics: physics,
      context: context,
      oldPosition: oldPosition,
      coordinator: this,
    );
  }

  void attach(ScrollPosition position) {
    if (position is LinkedScrollPosition) {
      _positions.add(position);
      position.correctPixels(_pixels);
    }
  }

  void detach(ScrollPosition position) {
    if (position is LinkedScrollPosition) {
      _positions.remove(position);
    }
  }

  void updatePixels(double newPixels, LinkedScrollPosition source) {
    if (_pixels == newPixels) return;
    _pixels = newPixels;
    for (final pos in _positions) {
      if (pos != source) {
        pos.correctPixels(newPixels);
        pos.forceNotify();
      }
    }
  }
}

class LinkedScrollPosition extends ScrollPositionWithSingleContext {
  LinkedScrollPosition({
    required super.physics,
    required super.context,
    super.oldPosition,
    required this.coordinator,
  });

  final LinkedScrollCoordinator coordinator;

  @override
  double setPixels(double newPixels) {
    if (newPixels == pixels) return 0.0;
    final double overscroll = super.setPixels(newPixels);
    coordinator.updatePixels(pixels, this);
    return overscroll;
  }

  @override
  void correctPixels(double value) {
    super.correctPixels(value);
  }

  void forceNotify() {
    notifyListeners();
  }
}
