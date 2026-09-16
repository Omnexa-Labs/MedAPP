import { Button, Notice } from '@/components/ui';
import { useNavigation } from '@/components/navigation';
export function ActionError({
  error,
  mustReload,
  reload,
  busy,
  creating,
}: {
  error: string;
  mustReload: boolean;
  reload: () => Promise<void>;
  busy: boolean;
  creating?: boolean;
}) {
  const navigation = useNavigation();
  if (!error) return null;
  return (
    <Notice
      danger
      action={
        mustReload && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              if (creating) navigation.navigate('/');
              else void reload();
            }}
          >
            {creating ? 'Check saved applications' : 'Reload saved application'}
          </Button>
        )
      }
    >
      <p>{error}</p>
      {mustReload && (
        <p>
          {creating
            ? 'We could not confirm whether this draft was saved. Check your applications before starting another draft.'
            : 'Reload the saved application before making another change. Your edits have been kept.'}
        </p>
      )}
    </Notice>
  );
}
