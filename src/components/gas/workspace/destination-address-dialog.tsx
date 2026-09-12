import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function DestinationAddressDialog({
  draft,
  error,
  onDraftChange,
  onOpenChange,
  onSave,
  open,
}: {
  draft: string;
  error: string | null;
  onDraftChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-4 p-5 sm:max-w-[480px]"
        initialFocus={false}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl tracking-[-0.04em]">
            Destination address
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            aria-label="Your destination chain account address"
            autoComplete="off"
            id="destination-address"
            aria-invalid={Boolean(error)}
            className="h-11 text-sm"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Your destination chain account address"
            spellCheck={false}
            value={draft}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row">
          <Button
            className="w-full rounded-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="w-full rounded-full sm:w-auto"
            onClick={onSave}
            size="sm"
            type="button"
          >
            Save address
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
