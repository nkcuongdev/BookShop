import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ConfirmContext = createContext(null);

const defaultState = {
  open: false,
  title: "Xác nhận",
  description: "Bạn có chắc chắn muốn thực hiện thao tác này?",
  confirmText: "Xác nhận",
  cancelText: "Huỷ",
  variant: "default",
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(defaultState);
  const resolver = useRef(null);

  const confirm = useCallback((opts = {}) => {
    setState({ ...defaultState, ...opts, open: true });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const handleClose = (value) => {
    setState((s) => ({ ...s, open: false }));
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state.open} onOpenChange={(o) => !o && handleClose(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{state.title}</DialogTitle>
            <DialogDescription>{state.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              {state.cancelText}
            </Button>
            <Button
              variant={state.variant === "destructive" ? "destructive" : "default"}
              onClick={() => handleClose(true)}
            >
              {state.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within <ConfirmProvider>");
  }
  return ctx;
}
