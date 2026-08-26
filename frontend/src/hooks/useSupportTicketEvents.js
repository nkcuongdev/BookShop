import { useEffect } from "react";
import { connectSocket } from "@/services/socket";

/**
 * Subscribes to the server's support ticket events so ticket views update as
 * soon as the other side acts, instead of waiting for the next poll.
 *
 * @param {(payload: { ticketId: string, ticket: object }) => void} onChange
 */
export function useSupportTicketEvents(onChange) {
  useEffect(() => {
    if (typeof onChange !== "function") return undefined;
    const socket = connectSocket();
    const handler = (payload) => onChange(payload || {});
    socket.on("support:ticket", handler);
    socket.on("support:message", handler);
    return () => {
      socket.off("support:ticket", handler);
      socket.off("support:message", handler);
    };
  }, [onChange]);
}

export default useSupportTicketEvents;
