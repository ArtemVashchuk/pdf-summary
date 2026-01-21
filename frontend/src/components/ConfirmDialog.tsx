import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    isDestructive?: boolean
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText,
    cancelText,
    isDestructive = false,
}: ConfirmDialogProps) {
    const { t } = useI18n();

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[420px] p-0 border-white/10 overflow-hidden">
                <DialogHeader className="p-8 pb-4 flex flex-col items-center text-center">
                    <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-transform hover:scale-110",
                        isDestructive ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
                    )}>
                        {isDestructive ? <AlertTriangle className="w-7 h-7" /> : <Info className="w-7 h-7" />}
                    </div>
                    <DialogTitle className="text-xl font-bold text-white mb-2">{title}</DialogTitle>
                    <DialogDescription className="text-gray-400 text-sm">
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="p-6 bg-white/[0.03] border-t border-white/[0.05] flex sm:flex-row gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="flex-1 bg-transparent border-white/10 hover:bg-white/5 text-gray-300 hover:text-white"
                    >
                        {cancelText || t('confirm.cancel')}
                    </Button>
                    <Button
                        variant={isDestructive ? "destructive" : "default"}
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={cn(
                            "flex-1 font-bold",
                            isDestructive ? "bg-red-500 hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.3)]" : "bg-primary hover:bg-primary/90 text-black"
                        )}
                    >
                        {confirmText || "Confirm"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
