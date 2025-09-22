import React, { useState, useRef } from 'react';
import styles from './DefinitionTooltip.module.css';

export function DefinitionTooltip({ children, label, description, style }) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef(null);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleFocus = () => {
    setIsVisible(true);
  };

  const handleBlur = () => {
    setIsVisible(false);
  };

  return (
    <div 
      className={styles.tooltipContainer}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      ref={tooltipRef}
    >
      {children}
      {isVisible && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipArrow} />
          <div className={styles.tooltipTitle}>{label}</div>
          <div className={styles.tooltipDescription}>{description}</div>
        </div>
      )}
    </div>
  );
}