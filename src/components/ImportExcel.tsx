import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSpreadsheet, Upload, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ColumnMapping {
  excelHeader: string;
  dbField: string;
  label: string;
}

interface ImportExcelProps {
  /** Fields the user can map to, e.g. [{dbField:'full_name', label:'Nome'}] */
  fields: { dbField: string; label: string; required?: boolean }[];
  /** Called with the mapped rows to insert */
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: number }>;
  buttonLabel?: string;
}

export function ImportExcel({ fields, onImport, buttonLabel = 'Importar Excel' }: ImportExcelProps) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) {
        toast({ title: 'Arquivo vazio ou sem dados', variant: 'destructive' });
        return;
      }
      const hdrs = data[0].map(h => String(h).trim());
      setHeaders(hdrs);
      setRows(data.slice(1).filter(r => r.some(c => String(c).trim())));

      // Auto-map by similarity
      const autoMap: Record<string, string> = {};
      for (const f of fields) {
        const match = hdrs.find(h =>
          h.toLowerCase() === f.label.toLowerCase() ||
          h.toLowerCase() === f.dbField.toLowerCase() ||
          h.toLowerCase().includes(f.label.toLowerCase())
        );
        if (match) autoMap[f.dbField] = match;
      }
      setMappings(autoMap);
      setOpen(true);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    const requiredFields = fields.filter(f => f.required);
    for (const rf of requiredFields) {
      if (!mappings[rf.dbField]) {
        toast({ title: `Mapeie o campo obrigatório: ${rf.label}`, variant: 'destructive' });
        return;
      }
    }

    setImporting(true);
    try {
      const mapped = rows.map(row => {
        const obj: Record<string, string> = {};
        for (const [dbField, excelHeader] of Object.entries(mappings)) {
          const idx = headers.indexOf(excelHeader);
          if (idx >= 0) obj[dbField] = String(row[idx] || '').trim();
        }
        return obj;
      }).filter(obj => Object.values(obj).some(v => v));

      const result = await onImport(mapped);
      toast({ title: `Importação concluída: ${result.success} registros, ${result.errors} erros` });
      setOpen(false);
      setHeaders([]);
      setRows([]);
      setMappings({});
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <FileSpreadsheet className="h-4 w-4 mr-1" /> {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mapear Colunas — {rows.length} linhas encontradas</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map(f => (
                <div key={f.dbField} className="space-y-1">
                  <label className="text-sm font-medium flex items-center gap-1">
                    {f.label}
                    {f.required && <AlertCircle className="h-3 w-3 text-destructive" />}
                  </label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mappings[f.dbField] || ''}
                    onChange={e => setMappings({ ...mappings, [f.dbField]: e.target.value })}
                  >
                    <option value="">— Ignorar —</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="text-sm text-muted-foreground">Pré-visualização (primeiras 5 linhas):</div>
            <div className="overflow-x-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="text-xs py-1">{String(cell)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button onClick={handleImport} disabled={importing} className="w-full">
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Importar {rows.length} registros
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
