import { Table } from 'react-bootstrap';
import { prepareTableChildren } from './responsiveTableLayout';

export default function ResponsiveTable({ children, className = '', ...props }) {
  return (
    <Table {...props} className={`workspace-responsive-table ${className}`}>
      {prepareTableChildren(children)}
    </Table>
  );
}
