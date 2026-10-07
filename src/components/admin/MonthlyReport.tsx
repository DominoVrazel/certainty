import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../services/FirebaseService";
import type { Training } from "../../services/trainings";

interface MonthlyReportProps {
  /**
   * Optional: the report loads the resort list itself and defaults to the
   * first, so it does not depend on a selection made elsewhere on the page.
   */
  resortId?: string;
}

interface ClubRow {
  club: string;
  trainings: number;
  racers: number;
  coaches: number;
  attended: number;
}

const MONTHS = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];

/**
 * How many clubs trained in a month, and with how many racers.
 *
 * One indexed query over (resortId, date) for the month — a few hundred
 * documents — and the rest is a reduce. It reads the same `trainings`
 * collection as the calendar, including everything migrated from the old
 * model, which is why the migration rewrote history into this shape rather
 * than leaving it in the old one.
 */
const MonthlyReport: React.FC<MonthlyReportProps> = ({ resortId }) => {
  const now = new Date();
  const [ownResortId, setOwnResortId] = useState<string | null>(
    resortId ?? null
  );
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resortId) {
      setOwnResortId(resortId);
      return;
    }
    const loadResorts = async () => {
      try {
        const snap = await getDocs(collection(db, "resorts"));
        setOwnResortId((current) => current ?? snap.docs[0]?.id ?? null);
      } catch (err) {
        console.error("Error loading resorts for report: ", err);
      }
    };
    loadResorts();
  }, [resortId]);

  useEffect(() => {
    if (!ownResortId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const to = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

        const snap = await getDocs(
          query(
            collection(db, "trainings"),
            where("resortId", "==", ownResortId),
            where("date", ">=", from),
            where("date", "<=", to)
          )
        );
        setTrainings(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Training))
        );
      } catch (err) {
        console.error("Error loading report: ", err);
        setError("Report sa nepodarilo načítať.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [ownResortId, year, month]);

  const { rows, totals } = useMemo(() => {
    const byClub = new Map<string, ClubRow>();

    for (const t of trainings) {
      for (const p of Object.values(t.participants ?? {})) {
        const club = p.sportClub || "(bez klubu)";
        const row =
          byClub.get(club) ??
          { club, trainings: 0, racers: 0, coaches: 0, attended: 0 };

        row.trainings += 1;
        row.racers += p.racers ?? 0;
        row.coaches += p.coaches ?? 0;
        if (p.attended) row.attended += 1;
        byClub.set(club, row);
      }
    }

    const rows = [...byClub.values()].sort((a, b) => b.racers - a.racers);

    return {
      rows,
      totals: {
        sessions: trainings.length,
        clubs: rows.length,
        racers: rows.reduce((s, r) => s + r.racers, 0),
        coaches: rows.reduce((s, r) => s + r.coaches, 0),
      },
    };
  }, [trainings]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="monthly-report">
      <h4>Mesačný report</h4>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <select
          className="form-control"
          aria-label="Mesiac"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((name, idx) => (
            <option key={name} value={idx}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="form-control"
          aria-label="Rok"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {error && <p>{error}</p>}
      {loading && <p>Načítavam…</p>}

      {!loading && !error && (
        <>
          <p data-testid="report-summary">
            <b>Tréningov:</b> {totals.sessions} &nbsp;
            <b>Klubov:</b> {totals.clubs} &nbsp;
            <b>Pretekárov:</b> {totals.racers} &nbsp;
            <b>Trénerov:</b> {totals.coaches}
          </p>

          {rows.length === 0 ? (
            <p>V tomto mesiaci neprebehol žiadny tréning.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Klub</th>
                  <th>Tréningov</th>
                  <th>Pretekárov</th>
                  <th>Trénerov</th>
                  <th>Potvrdená účasť</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.club}>
                    <td>{r.club}</td>
                    <td>{r.trainings}</td>
                    <td>{r.racers}</td>
                    <td>{r.coaches}</td>
                    <td>{r.attended}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};

export default MonthlyReport;
