import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const twClassNames = (...inputs) => {
  return twMerge(clsx(inputs));
};

export default twClassNames;
