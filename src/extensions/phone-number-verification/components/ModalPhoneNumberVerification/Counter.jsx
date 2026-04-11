import { useEffect, useRef, useState } from 'react';
import { func, number } from 'prop-types';

const Counter = ({ initialCount, children }) => {
  const [count, setCount] = useState(initialCount);

  const timerRef = useRef();

  useEffect(() => {
    timerRef.current = setInterval(() => setCount((prevCount) => prevCount - 1), 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (count === 0) {
      clearInterval(timerRef.current);
    }
  }, [count]);

  const resetCounter = () => {
    setCount(initialCount);
    timerRef.current = setInterval(() => setCount((prevCount) => prevCount - 1), 1000);
  };

  return children(count, resetCounter);
};

Counter.propTypes = {
  initialCount: number.isRequired,
  children: func.isRequired,
};

export default Counter;
