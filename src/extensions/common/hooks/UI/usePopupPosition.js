import { useLayoutEffect, useRef, useState } from 'react';

export const POPUP_APPEAR_DIRECTION = {
  DOWN: 'down',
  RIGHT: 'right',
};

const getPopupStyle = ({
  position,
  windowWidth,
  containerCurrentRef,
  popupCurrentRef,
  compareOffset,
  contentPlacementOffset,
}) => {
  switch (position) {
    case POPUP_APPEAR_DIRECTION.DOWN: {
      const distanceToRight = windowWidth - containerCurrentRef.getBoundingClientRect().right;
      const contentOverflowWidth = popupCurrentRef.offsetWidth - containerCurrentRef.offsetWidth;
      const renderToRight = distanceToRight > contentOverflowWidth + compareOffset;

      return renderToRight ? { left: contentPlacementOffset } : { right: contentPlacementOffset };
    }

    case POPUP_APPEAR_DIRECTION.RIGHT: {
      const contentRightPos =
        containerCurrentRef.getBoundingClientRect().right + popupCurrentRef.offsetWidth;
      const renderToRight = contentRightPos + compareOffset < windowWidth;

      return renderToRight ? { left: contentPlacementOffset } : { right: contentPlacementOffset };
    }

    default:
      return {};
  }
};

const usePopupPosition = (
  position = POPUP_APPEAR_DIRECTION.DOWN,
  compareOffset = 0,
  contentPlacementOffset = 0
) => {
  const containerRef = useRef(null);
  const popupRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});
  const { current: containerCurrentRef } = containerRef;
  const { current: popupCurrentRef } = popupRef;

  const calculateStyle = () => {
    if (!containerRef.current || !popupRef.current) return;

    setPopupStyle(
      getPopupStyle({
        position,
        windowWidth: window.innerWidth,
        containerCurrentRef: containerRef.current,
        popupCurrentRef: popupRef.current,
        compareOffset,
        contentPlacementOffset,
      })
    );
  };

  useLayoutEffect(() => {
    const resizeObserver = new ResizeObserver(calculateStyle);
    if (containerCurrentRef) resizeObserver.observe(containerCurrentRef);
    if (popupCurrentRef) resizeObserver.observe(popupCurrentRef);
    calculateStyle();

    return () => resizeObserver.disconnect();
  }, []);

  return {
    containerRef,
    popupRef,
    popupStyle,
  };
};

export default usePopupPosition;
