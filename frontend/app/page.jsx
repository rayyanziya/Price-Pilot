"use client";

import { useState } from "react";

const initialForm = {
  brand: "Apple",
  model: "iPhone 13",
  storage_gb: 128,
  condition_grade: "B",
  battery_health_pct: 87,
  has_box: true,
};
const quoteEndpoint = "/api/v1/price/quote";

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getSubmissionErrorMessage(responsePayload) {
  if (responsePayload?.error?.message) {
    return responsePayload.error.message;
  }

  if (responsePayload?.error?.code === "MODEL_DATA_NOT_AVAILABLE") {
    return "No model data is available for this smartphone yet.";
  }

  return "Quote service is unavailable. Check that the local backend is running and try again.";
}

export default function HomePage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(quoteEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          storage_gb: Number(form.storage_gb),
          battery_health_pct: Number(form.battery_health_pct),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(getSubmissionErrorMessage(payload));
      }

      setResult(payload);
    } catch (submissionError) {
      setResult(null);
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Quote service is unavailable. Check that the local backend is running and try again.";
      setError(message);
      console.error("Quote request failed", submissionError);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">PricePilot MVP</p>
        <h1>Instant resale guidance for Indonesian smartphone listings.</h1>
        <p className="lede">
          Submit a device profile, receive a deterministic quote range, and see the reasoning behind the
          recommendation.
        </p>
      </section>

      <section className="workspace">
        <form className="quote-form" onSubmit={handleSubmit}>
          <label>
            Brand
            <input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} required />
          </label>
          <label>
            Model
            <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} required />
          </label>
          <label>
            Storage (GB)
            <input
              type="number"
              min="1"
              value={form.storage_gb}
              onChange={(event) => setForm({ ...form, storage_gb: event.target.value })}
              required
            />
          </label>
          <label>
            Condition grade
            <select
              value={form.condition_grade}
              onChange={(event) => setForm({ ...form, condition_grade: event.target.value })}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </label>
          <label>
            Battery health (%)
            <input
              type="number"
              min="0"
              max="100"
              value={form.battery_health_pct}
              onChange={(event) => setForm({ ...form, battery_health_pct: event.target.value })}
              required
            />
          </label>
          <label className="toggle-row">
            <span>Has original box</span>
            <input
              type="checkbox"
              checked={form.has_box}
              onChange={(event) => setForm({ ...form, has_box: event.target.checked })}
            />
          </label>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Calculating..." : "Get quote"}
          </button>
        </form>

        <aside className="result-card">
          <p className="result-label">Quote result</p>
          {error ? <p className="error-state">{error}</p> : null}
          {!error && !result ? <p className="empty-state">Run a quote to see the price band and confidence.</p> : null}
          {result ? (
            <>
              <div className="price-grid">
                <article>
                  <span>Low</span>
                  <strong>{formatCurrency(result.low_price)}</strong>
                </article>
                <article>
                  <span>Average</span>
                  <strong>{formatCurrency(result.average_price)}</strong>
                </article>
                <article>
                  <span>High</span>
                  <strong>{formatCurrency(result.high_price)}</strong>
                </article>
              </div>
              <div className="recommended">
                <span>Recommended price</span>
                <strong>{formatCurrency(result.recommended_price)}</strong>
              </div>
              <dl className="metadata">
                <div>
                  <dt>Confidence</dt>
                  <dd>{Math.round(result.confidence * 100)}%</dd>
                </div>
                <div>
                  <dt>Fallback used</dt>
                  <dd>{result.fallback_used ? "Yes" : "No"}</dd>
                </div>
              </dl>
              <div className="explanations">
                <h2>Why this price</h2>
                <ul>
                  {result.explanations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
