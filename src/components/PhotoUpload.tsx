import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PhotoUploadProps {
  currentUrl?: string | null;
  folder: 'children' | 'guardians' | 'teachers';
  onUploaded: (url: string) => void;
  name?: string;
  size?: 'sm' | 'lg';
}

export function PhotoUpload({ currentUrl, folder, onUploaded, name, size = 'lg' }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const sizeClass = size === 'lg' ? 'h-24 w-24' : 'h-12 w-12';
  const iconSize = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Selecione uma imagem válida.', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 5MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);

    try {
      const ext = file.name.split('.').pop();
      const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      setPreview(publicUrl);
      onUploaded(publicUrl);
      toast({ title: 'Foto enviada!' });
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUploaded('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className={sizeClass}>
          <AvatarImage src={preview || undefined} alt={name || 'Foto'} />
          <AvatarFallback className="text-lg bg-secondary">{initials}</AvatarFallback>
        </Avatar>
        {preview && (
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className={`${iconSize} animate-spin mr-1`} />
          ) : (
            <Camera className={`${iconSize} mr-1`} />
          )}
          {preview ? 'Trocar foto' : 'Adicionar foto'}
        </Button>
        <p className="text-xs text-muted-foreground mt-1">JPG, PNG. Máx 5MB.</p>
      </div>
    </div>
  );
}
