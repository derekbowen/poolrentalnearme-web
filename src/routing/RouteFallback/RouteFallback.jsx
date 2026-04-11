import React from 'react';
import IconSpinner from '../../components/IconSpinner/IconSpinner';
import css from './RouteFallback.module.css';

// TODO: Update the RouteFallback component to show a "fancy" component when a route is loading instead of a simple spinner
const RouteFallback = () => {
  return (
    <div className={css.root}>
      <IconSpinner />
    </div>
  );
};

export default RouteFallback;
