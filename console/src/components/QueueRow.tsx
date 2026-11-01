import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./Button";
import { StatusPill, type Status } from "./StatusPill";
import { SmsPreview } from "./SmsPreview";

interface Props {
  name: string;
  about: string | null;       // pet or family member, null when the text is about the patient
  reason: string;             // "Cleaning due today"
  status: Status;
  statusLabel?: string;
  note?: string | null;       // why it is held, in plain words
  sender?: string;
  body?: string | null;
  onSkip?: () => void;
  onUndo?: () => void;
}

/** One proposed text in the daily queue. */
export function QueueRow({ name, about, reason, status, statusLabel, note, sender, body, onSkip, onUndo }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <li className="queue-row">
      <div className="queue-main">
        <div className="queue-who">
          <p className="body-strong">{name}{about ? <span className="muted body"> · {about}</span> : null}</p>
          <p className="caption muted">{reason}</p>
          {note ? <p className="caption queue-note">{note}</p> : null}
        </div>
        <div className="queue-actions">
          <StatusPill status={status} label={statusLabel} />
          {body ? (
            <Button variant="quiet" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}
              icon={open ? <ChevronUp size={16} strokeWidth={1.5} aria-hidden /> : <ChevronDown size={16} strokeWidth={1.5} aria-hidden />}>
              {open ? "Hide text" : "See text"}
            </Button>
          ) : null}
          {onSkip ? <Button variant="quiet" size="sm" onClick={onSkip}>Skip</Button> : null}
          {onUndo ? <Button variant="quiet" size="sm" onClick={onUndo}>Undo</Button> : null}
        </div>
      </div>
      {open && body && sender ? <SmsPreview sender={sender} body={body} /> : null}
    </li>
  );
}
