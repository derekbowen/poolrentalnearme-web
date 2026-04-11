import { useEffect, useState } from 'react';

const useAnimation = (mounted) => {
  const [shouldRender, setShouldRender] = useState(mounted);

  useEffect(() => {
    if (mounted) {
      setShouldRender(true);
    }
  }, [mounted]);

  const onAnimationEnd = () => {
    if (!mounted) {
      setShouldRender(false);
    }
  };

  return [shouldRender, onAnimationEnd];
};

export default useAnimation;