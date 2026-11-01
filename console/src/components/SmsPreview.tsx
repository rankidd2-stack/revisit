import { measureSms } from "../../../src/domain/sms";

/** An outgoing text as the patient's phone shows it, footer and counter included. */
export function SmsPreview({ sender, body }: { sender: string; body: string }) {
  const size = measureSms(body);
  const limit = size.segments <= 1 ? size.perSegment : size.segments * size.perSegment;
  return (
    <figure className="sms">
      <figcaption className="sms-sender label">{sender}</figcaption>
      <div className="sms-bubble body">{body}</div>
      <p className="sms-count data muted">
        {size.segments} {size.segments === 1 ? "text" : "texts"} · {size.units}/{limit} characters · {size.encoding}
      </p>
    </figure>
  );
}
