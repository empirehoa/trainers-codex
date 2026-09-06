import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Flag, Loader2, MapPin, Quote, ShieldAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Pokemon } from '@/lib/types';
import { POKEMON_BY_ID, pixelSprite } from '@/lib/pokemon';
import { TYPE_COLORS } from '@/lib/constants';
import {
  REPORT_REASONS, shapeReportPayload,
  type ProfileClient, type PublicProfile, type PublicTeam, type ReportReason,
} from '@/lib/profiles';
import { TypePill } from './TypePill';

interface PublicProfileViewProps {
  handle: string;
  client: ProfileClient | null;
  /** Current signed-in user id, enables the report form. */
  viewerId?: string | null;
  onExit: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'missing' }
  | { kind: 'ready'; profile: PublicProfile; teams: PublicTeam[] };

export function PublicProfileView({ handle, client, viewerId, onExit }: PublicProfileViewProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!client) { setState({ kind: 'offline' }); return; }
    setState({ kind: 'loading' });
    (async () => {
      const profile = await client.getProfile(handle);
      if (cancelled) return;
      if (!profile) { setState({ kind: 'missing' }); return; }
      const teams = await client.getTeams(handle);
      if (cancelled) return;
      setState({ kind: 'ready', profile, teams });
    })();
    return () => { cancelled = true; };
  }, [handle, client]);

  return (
    <div className="min-h-screen w-full text-foreground bg-background crt-scan crt-vignette grain">
      <header className="border-b sticky top-0 z-30 backdrop-blur-md bg-background/92" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onExit} className="font-mono text-[11px] gap-1.5">
            <ArrowLeft size={13} /> codex
          </Button>
          <div className="font-mono text-[11px] text-muted-foreground truncate">// /u/{handle}</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {state.kind === 'loading' && (
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground py-16 justify-center">
            <Loader2 size={14} className="animate-spin" /> loading profile…
          </div>
        )}

        {state.kind === 'offline' && (
          <div className="text-center py-16">
            <ShieldAlert size={28} className="mx-auto text-muted-foreground mb-3" />
            <div className="font-display text-sm text-primary mb-1">cloud features are off</div>
            <p className="font-mono text-[11px] text-muted-foreground max-w-sm mx-auto">
              // public profiles need a configured cloud backend. this deployment runs offline-only.
            </p>
          </div>
        )}

        {state.kind === 'missing' && (
          <div className="text-center py-16">
            <Users size={28} className="mx-auto text-muted-foreground mb-3" />
            <div className="font-display text-sm text-primary mb-1">no trainer here</div>
            <p className="font-mono text-[11px] text-muted-foreground">// @{handle} hasn't claimed a public profile.</p>
          </div>
        )}

        {state.kind === 'ready' && (
          <ReadyProfile
            profile={state.profile}
            teams={state.teams}
            viewerId={viewerId}
            client={client}
            reportOpen={reportOpen}
            setReportOpen={setReportOpen}
          />
        )}
      </main>
    </div>
  );
}

function ReadyProfile({
  profile, teams, viewerId, client, reportOpen, setReportOpen,
}: {
  profile: PublicProfile;
  teams: PublicTeam[];
  viewerId?: string | null;
  client: ProfileClient | null;
  reportOpen: boolean;
  setReportOpen: (v: boolean) => void;
}) {
  return (
    <>
      {/* Profile header card */}
      <section className="border rounded-md p-4 mb-5" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg text-primary truncate">@{profile.handle}</h1>
            {profile.display && <div className="text-sm truncate">{profile.display}</div>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 font-mono text-[10px] text-muted-foreground">
              {profile.region && <span className="flex items-center gap-1"><MapPin size={10} /> {profile.region}</span>}
              {profile.motto && <span className="flex items-center gap-1 italic"><Quote size={10} /> {profile.motto}</span>}
            </div>
            {profile.bio && <p className="text-xs text-foreground/80 mt-2 whitespace-pre-wrap break-words">{profile.bio}</p>}
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => setReportOpen(!reportOpen)}
            title="Report this profile"
            className="shrink-0 font-mono text-[10px] gap-1 text-muted-foreground hover:text-destructive"
          >
            <Flag size={11} /> report
          </Button>
        </div>

        {reportOpen && (
          <ReportForm
            targetKind="profile"
            targetId={profile.handle}
            viewerId={viewerId}
            client={client}
            onDone={() => setReportOpen(false)}
          />
        )}
      </section>

      {/* Teams */}
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="font-display text-sm text-primary">teams</h2>
        <div className="font-mono text-[10px] text-muted-foreground">// {teams.length} public</div>
      </div>

      {teams.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground py-6 text-center">// no public teams yet.</p>
      ) : (
        <div className="space-y-3">
          {teams.map(t => <TeamCard key={t.id} team={t} />)}
        </div>
      )}
    </>
  );
}

function TeamCard({ team }: { team: PublicTeam }) {
  const mons = useMemo(
    () => team.members.filter(Boolean).map(m => ({ m: m!, p: POKEMON_BY_ID[m!.id] as Pokemon | undefined })),
    [team]
  );
  return (
    <section className="border rounded-md p-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="text-xs mb-2 truncate">{team.name}</div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {mons.map(({ m, p }, i) => (
          <div key={i} className="rounded border p-1.5 flex flex-col items-center gap-1" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="w-10 h-10 rounded flex items-center justify-center"
                 style={{ background: p ? `radial-gradient(circle, ${TYPE_COLORS[p.types[0]]}33, transparent)` : undefined }}>
              <img src={pixelSprite(m.id, m.shiny)} alt="" className="pixel-img w-full h-full object-contain" loading="lazy"
                   onError={(e) => { if (m.shiny) (e.currentTarget as HTMLImageElement).src = pixelSprite(m.id); }} />
            </div>
            <div className="text-[10px] font-mono truncate w-full text-center">{m.nickname || p?.display || `#${m.id}`}</div>
            {p && <div className="flex gap-0.5">{p.types.map(t => <TypePill key={t} type={t} sm />)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportForm({
  targetKind, targetId, viewerId, client, onDone,
}: {
  targetKind: 'profile' | 'team';
  targetId: string;
  viewerId?: string | null;
  client: ProfileClient | null;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!viewerId) {
    return (
      <div className="mt-3 pt-3 border-t font-mono text-[10px] text-muted-foreground" style={{ borderColor: 'hsl(var(--border))' }}>
        // sign in to report this profile.
      </div>
    );
  }

  const submit = async () => {
    const shaped = shapeReportPayload({ reporterId: viewerId, targetKind, targetId, reason, detail });
    if (!shaped.ok) { setMsg(shaped.error || 'Invalid report.'); return; }
    if (!client) { setMsg('Reporting is unavailable offline.'); return; }
    setBusy(true);
    const res = await client.fileReport(shaped.row!);
    setBusy(false);
    if (res.ok) { setMsg('Report filed. Thanks.'); setTimeout(onDone, 1200); }
    else setMsg(res.error || 'Could not file the report.');
  };

  return (
    <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="font-mono text-[10px] text-muted-foreground">// report reason</div>
      <div className="flex flex-wrap gap-1.5">
        {REPORT_REASONS.map(r => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className="rounded border px-2 py-1 font-mono text-[10px] capitalize transition"
            style={{
              borderColor: reason === r ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              color: reason === r ? 'hsl(var(--primary))' : undefined,
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="// optional detail (max 500 chars)"
        maxLength={500}
        rows={2}
        className="w-full bg-transparent border rounded px-2 py-1 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-1"
        style={{ borderColor: 'hsl(var(--border))' }}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={busy} className="font-mono text-[10px] gap-1.5">
          {busy && <Loader2 size={11} className="animate-spin" />} submit report
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="font-mono text-[10px]">cancel</Button>
        {msg && <span className="font-mono text-[10px] text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
