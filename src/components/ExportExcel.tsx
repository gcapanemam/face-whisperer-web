import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExportExcelProps {
  getData: () => Record<string, any>[];
  columns: { key: string; header: string }[];
  filename: string;
  buttonLabel?: string;
}

export function ExportExcel({ getData, columns, filename, buttonLabel = 'Exportar Excel' }: ExportExcelProps) {
  const handleExport = () => {
    const data = getData();
    const rows = data.map(row =>
      columns.reduce((acc, col) => {
        acc[col.header] = row[col.key] ?? '';
        return acc;
      }, {} as Record<string, any>)
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-1" /> {buttonLabel}
    </Button>
  );
}
