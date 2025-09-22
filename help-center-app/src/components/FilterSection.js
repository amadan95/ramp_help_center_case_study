import React from 'react';
import { DefinitionTooltip } from './DefinitionTooltip';
import styles from './FilterSection.module.css';

export function FilterSection({ title, options = [], selected = [], onSelect, emptyLabel = 'No options available' }) {
  if (!options.length) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.emptyLabel}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.optionsList}>
        {options.map(option => {
          const isSelected = selected.includes(option.value);
          
          const chip = (
            <button
              key={option.value}
              className={`${styles.option} ${isSelected ? styles.selected : ''}`}
              onClick={() => onSelect && onSelect(option.value)}
            >
              {option.label}
            </button>
          );

          return option.definition ? (
            <DefinitionTooltip 
              key={option.value}
              label={option.label} 
              description={option.definition}
            >
              {chip}
            </DefinitionTooltip>
          ) : chip;
        })}
      </div>
    </div>
  );
}