import { useEffect, useState } from "react";
import { api } from "../../api";
import { useStore } from "../../store";

/**
 * FR-015/FR-016: the shared booking checkpoint — verify → (price-increase
 * re-confirm) → masked summary → consent to the EXACT displayed total →
 * Sandbox/fixture result. Fixed sequence, no shortcuts, from any entry point.
 */
type Step =
  | { k: "verifying" }
  | { k: "price-changed"; bookingId: string; total: number; prev: number | null; currency: string }
  | { k: "passenger"; bookingId: string; total: number; currency: string }
  | { k: "summary"; confirmationId: string; summary: Summary }
  | { k: "paying"; confirmationId: string; summary: Summary }
  | { k: "done"; result: Result }
  | { k: "error"; message: string };

interface Summary {
  flight_no: string;
  route: string;
  depart: string;
  passenger_masked: string;
  total: number;
  currency: string;
  payment_deadline: string;
}

interface Result {
  order_no: string;
  pnr: string;
  ticket_numbers: string[];
  ticketing_status: string;
  environment: string;
  mode: string;
}

const DEMO_PASSENGER = {
  full_name: "TEST/TRAVELER",
  gender: "Male",
  date_of_birth: "1990-01-01",
  nationality: "JP",
  document_type: "Passport",
  document_number: "TR0000001",
  issuing_country: "JP",
  expiry_date: "2032-12-31",
  contact_name: "TEST/TRAVELER",
};

export function BookingFlow() {
  const { bookingOffer, openBooking, mode } = useStore();
  const [step, setStep] = useState<Step>({ k: "verifying" });
  const [name, setName] = useState(DEMO_PASSENGER.full_name);

  useEffect(() => {
    if (!bookingOffer) return;
    setStep({ k: "verifying" });
    api
      .verify(bookingOffer)
      .then((v) =>
        setStep(
          v.price_changed
            ? { k: "price-changed", bookingId: v.booking_id, total: v.total, prev: v.previous_total, currency: v.currency }
            : { k: "passenger", bookingId: v.booking_id, total: v.total, currency: v.currency },
        ),
      )
      .catch((e) => setStep({ k: "error", message: String(e.message ?? e) }));
  }, [bookingOffer]);

  if (!bookingOffer) return null;

  async function acceptPrice(bookingId: string, total: number, currency: string) {
    await api.acceptPrice(bookingId);
    setStep({ k: "passenger", bookingId, total, currency });
  }

  async function submitPassenger(bookingId: string) {
    try {
      const res = await api.order(bookingId, [{ ...DEMO_PASSENGER, full_name: name, contact_name: name }]);
      setStep({ k: "summary", confirmationId: res.confirmation_id, summary: res.summary });
    } catch (e) {
      setStep({ k: "error", message: String(e instanceof Error ? e.message : e) });
    }
  }

  async function approve(confirmationId: string, summary: Summary) {
    setStep({ k: "paying", confirmationId, summary });
    try {
      const result = await api.pay(confirmationId, summary.total);
      setStep({ k: "done", result });
    } catch (e) {
      setStep({ k: "error", message: String(e instanceof Error ? e.message : e) });
    }
  }

  return (
    <div className="overlay" onClick={() => openBooking(null)}>
      <div className="booking-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="booking-head">
          <h3>Booking checkpoint</h3>
          <span className={`env-badge ${mode === "fixture" ? "fixture" : "sandbox"}`}>
            {mode === "fixture" ? "FIXTURE" : "SANDBOX"}
          </span>
          <button className="close" onClick={() => openBooking(null)}>✕</button>
        </header>

        {step.k === "verifying" && <div className="booking-body">Re-verifying the offer price…</div>}

        {step.k === "price-changed" && (
          <div className="booking-body">
            <p className="price-warn">
              The verified price moved: <s>S${step.prev}</s> → <b>S${step.total}</b>.
            </p>
            <p>Nothing proceeds until you accept the new total.</p>
            <button className="cta" onClick={() => void acceptPrice(step.bookingId, step.total, step.currency)}>
              Accept S${step.total}
            </button>
          </div>
        )}

        {step.k === "passenger" && (
          <div className="booking-body">
            <p className="dim">Verified · total with bag <b>S${step.total}</b></p>
            <label className="field">
              <span>Passenger (fictional — test environment)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <p className="micro">One-time input — never stored, never logged.</p>
            <button className="cta" onClick={() => void submitPassenger(step.bookingId)}>
              Create test order →
            </button>
          </div>
        )}

        {(step.k === "summary" || step.k === "paying") && (
          <div className="booking-body">
            <div className="masked-summary">
              <div className="ms-row"><span>flight</span><b>{step.summary.flight_no} · {step.summary.route}</b></div>
              <div className="ms-row"><span>departs</span><b>{step.summary.depart}</b></div>
              <div className="ms-row"><span>passenger</span><b>{step.summary.passenger_masked}</b></div>
              <div className="ms-row total"><span>total</span><b>{step.summary.currency} {step.summary.total}</b></div>
              <div className="ms-row"><span>pay within</span><b>{step.summary.payment_deadline}</b></div>
            </div>
            <button
              className="cta consent"
              disabled={step.k === "paying"}
              onClick={() => void approve(step.confirmationId, step.summary)}
            >
              {step.k === "paying" ? "Paying…" : `I approve this exact payment of ${step.summary.currency} ${step.summary.total}`}
            </button>
            <p className="micro">Single-use confirmation — the agent cannot re-fire this.</p>
          </div>
        )}

        {step.k === "done" && (
          <div className="booking-body done">
            <div className="ticket">
              <div className="ticket-punch" />
              <div className="ticket-head">test ticket issued · {step.result.environment}</div>
              <div className="ms-row"><span>order</span><b>{step.result.order_no}</b></div>
              <div className="ms-row"><span>PNR</span><b>{step.result.pnr}</b></div>
              <div className="ms-row"><span>ticket</span><b>{step.result.ticket_numbers.join(", ")}</b></div>
              <div className="ms-row"><span>status</span><b>{step.result.ticketing_status}</b></div>
            </div>
            <button className="cta" onClick={() => openBooking(null)}>Done</button>
          </div>
        )}

        {step.k === "error" && (
          <div className="booking-body">
            <p className="plan-error">{step.message}</p>
            <button className="cta" onClick={() => openBooking(null)}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
