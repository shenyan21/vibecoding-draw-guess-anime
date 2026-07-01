import { AlertTriangle, X } from "lucide-react";
import { useRoomStore } from "../store/roomStore";

export function ErrorToast() {
  const error = useRoomStore((state) => state.error);
  const clearError = useRoomStore((state) => state.clearError);
  if (!error) return null;
  return (
    <div className="error-toast" role="alert">
      <AlertTriangle size={18} />
      <span>{error}</span>
      <button className="icon-button" onClick={clearError} aria-label="关闭">
        <X size={16} />
      </button>
    </div>
  );
}
