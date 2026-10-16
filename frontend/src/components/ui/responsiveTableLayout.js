import { Children, cloneElement, createElement, Fragment, isValidElement } from 'react';

function headingText(children) {
  return Children.toArray(children).map((child) => (
    isValidElement(child) ? headingText(child.props.children) : String(child)
  )).join('').replace(/\s+/g, ' ').trim();
}

function labelRows(children, labels) {
  return Children.map(children, (row) => {
    if (!isValidElement(row)) return row;
    if (row.type === Fragment) return cloneElement(row, {}, labelRows(row.props.children, labels));
    if (row.type !== 'tr') return row;
    let column = 0;
    return cloneElement(row, {}, Children.map(row.props.children, (cell) => {
      if (!isValidElement(cell) || !['td', 'th'].includes(cell.type)) return cell;
      const span = Number(cell.props.colSpan || 1);
      const label = span === 1 ? cell.props['data-label'] || labels[column] || 'Details' : undefined;
      column += span;
      return cloneElement(cell, {
        'data-label': label,
        className: [cell.props.className, span > 1 && 'workspace-table-full-row'].filter(Boolean).join(' '),
      }, createElement('div', { className: 'workspace-table-cell-content' }, cell.props.children));
    }));
  });
}

export function prepareTableChildren(children) {
  const header = Children.toArray(children).find((child) => isValidElement(child) && child.type === 'thead');
  const headingRow = Children.toArray(header?.props.children).find((child) => isValidElement(child) && child.type === 'tr');
  const labels = Children.toArray(headingRow?.props.children).flatMap((cell) => (
    isValidElement(cell) ? Array(Number(cell.props.colSpan || 1)).fill(headingText(cell.props.children)) : []
  ));
  return Children.map(children, (section) => (
    isValidElement(section) && section.type === 'tbody'
      ? cloneElement(section, {}, labelRows(section.props.children, labels))
      : section
  ));
}
