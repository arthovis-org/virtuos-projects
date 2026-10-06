import { useEffect } from 'react';

/**
 * While the camera is dragged (any button on the orbit surface), the sites on the screens stop
 * catching the pointer. A drag that ended over a screen ended inside that site's own page: the
 * orbit controls never heard the button go up and kept turning the camera with no button
 * held. With the sites out of the way, the release reaches the controls wherever it happens.
 * (Window drags do the same: `ws-dragging`.) Should a release still go missing, the pointer
 * moving with no button down hands the controls the release they missed.
 */
export function useOrbitGuard(surface: HTMLElement | null) {
  useEffect(() => {
    if (!surface) return;
    const classes = document.body.classList;
    let pointer: number | null = null;
    const end = () => {
      pointer = null;
      classes.remove('ws-orbiting');
    };
    const start = (event: PointerEvent) => {
      pointer = event.pointerId;
      classes.add('ws-orbiting');
    };
    const onMove = (event: PointerEvent) => {
      if (pointer === null || event.pointerId !== pointer || event.buttons !== 0) return;
      surface.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: pointer,
          pointerType: event.pointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: true,
        }),
      );
      end();
    };
    surface.addEventListener('pointerdown', start);
    surface.addEventListener('lostpointercapture', end);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    return () => {
      end();
      surface.removeEventListener('pointerdown', start);
      surface.removeEventListener('lostpointercapture', end);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
    };
  }, [surface]);
}
