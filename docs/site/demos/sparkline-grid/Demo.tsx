'use client';

import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Sparkline } from '@salmonui/charts/sparkline';

interface Product {
  id: string;
  name: string;
  trend: number[];
}

const products: Product[] = Array.from({ length: 200 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Product ${i + 1}`,
  trend: Array.from({ length: 16 }, (_, k) => Math.round(50 + 30 * Math.sin(k / 2.5 + i) + ((k * 7 + i * 3) % 9))),
}));

const columns: DataGridColumn<Product>[] = [
  { field: 'id', header: 'Id', primaryKey: true, width: 90 },
  { field: 'name', header: 'Product', width: 160 },
  { field: 'trend', header: 'Last 16 weeks', type: 'string', sortable: false, width: 170, renderCell: ({ row }) => <Sparkline data={row.trend} width={140} height={24} highlights={{ high: true, low: true }} /> },
  { field: 'trend', id: 'weekly', header: 'Weekly', type: 'string', sortable: false, width: 170, renderCell: ({ row }) => <Sparkline data={row.trend.slice(-8)} type="column" width={140} height={24} color="#0f766e" /> },
];

export default function SparklineGridDemo() {
  return <DataGrid<Product> aria-label="Products with sparklines" data={products} columns={columns} height={360} />;
}
