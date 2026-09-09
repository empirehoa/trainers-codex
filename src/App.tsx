import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import {
  Search, BarChart3, ArrowUpDown,
  Share2, Grid3x3, Filter as FilterIcon,
  RotateCcw, FolderOpen, HelpCircle, Dices,
  User, Wand2, ShoppingBag, LogIn, Cloud, Compass,
  Sun, Moon, Sparkles, ClipboardList, Globe, MoreHorizontal, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster, toast } from 'sonner';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { Pokemon, SavedTeam, PokemonType, Role, Stats, TeamMember, TrainerProfile } from '@/lib/types';
import {
  POKEMON_BY_ID, POKEMON_LIST, POKEMON_TOTAL,
  getGen
} from '@/lib/pokemon';
import {
  TYPES, GENERATIONS, ROLES, STARTER_TEAMS, THEMED_TEAMS, MAINLINE_GAMES
} from '@/lib/constants';
import {
  analyzeTeamCompatibility, recommendTargetGame, isPokemonAvailableIn
} from '@/lib/compatibility';
import {
  computeDefensive, computeOffensive, computeStats,
  computeThreats, computeUncovered, suggestFillers,
  suggestCounterTeam, generateRandomTeam,
  buildShareCode, parseShareCode, computeTeamMatchup
} from '@/lib/analysis';
import { BADGE_REGIONS, badgesForRegion } from '@/lib/merch-renderers';
import { loadStorage, saveStorage, genId } from '@/lib/storage';
import { initialSearchQuery } from '@/lib/search-param';
import {
  type Ruleset, UNRESTRICTED, FORMAT_PRESETS, presetById,
  checkLegality, teamLegality, isUnrestricted, isLegal,
} from '@/lib/formats';
import {
  getStoredLicense, bootstrapFromCheckoutReturn, isWorkerConfigured,
  applyOwnerUnlock, hasOwnerUnlock, clearLicense, maybeReverifyLicense,
  consumeMerchReturn } from '@/lib/license';

import { PokemonCard } from '@/components/codex/PokemonCard';
import { TeamSlot } from '@/components/codex/TeamSlot';
import { TypePill } from '@/components/codex/TypePill';
import { PokemonDetailDialog } from '@/components/codex/PokemonDetailDialog';
import { AnalysisSheet } from '@/components/codex/AnalysisSheet';
import { LibraryDialog } from '@/components/codex/LibraryDialog';
import { HelpDialog } from '@/components/codex/HelpDialog';
import { ShareDialog } from '@/components/codex/ShareDialog';
import { TypeChartDialog } from '@/components/codex/TypeChartDialog';
import { TeamMemberConfigDialog } from '@/components/codex/TeamMemberConfigDialog';
import { TrainerProfileDialog } from '@/components/codex/TrainerProfileDialog';
import { TCGCardsDialog } from '@/components/codex/TCGCardsDialog';
import { PosterStudioDialog } from '@/components/codex/PosterStudioDialog';
import { MerchStudioDialog } from '@/components/codex/MerchStudioDialog';
import { AIStudioDialog } from '@/components/codex/AIStudioDialog';
import { ShowdownImportDialog } from '@/components/codex/ShowdownImportDialog';
import { SignInDialog } from '@/components/codex/SignInDialog';
import { SharedTeamLanding } from '@/components/codex/SharedTeamLanding';
import { parsePokePaste, exportPokePaste } from '@/lib/showdown';
import { computeMatchup, bestMove } from '@/lib/matchup';
import { PublicProfileView } from '@/components/codex/PublicProfileView';
import { PublishProfileDialog } from '@/components/codex/PublishProfileDialog';
import {
  validateHandle, parseProfileRoute, profileUrl,
  shapeProfilePayload, shapeTeamPayload, shapeReportPayload, sanitizeText,
  type ProfileClient,
} from '@/lib/profiles';
import { getProfileClient } from '@/lib/profiles-client';
import { sanitizeListingTitle } from '@/lib/merch';
import { LiveCoverageStrip } from '@/components/codex/LiveCoverageStrip';
import { JourneyModeDialog } from '@/components/codex/journey/JourneyModeDialog';
import { auth, type AuthSession } from '@/lib/auth';
import { isEnabled } from '@/lib/flags';
import { parseCurrentJourneyLink } from '@/journey/deeplink';
import { trackCommerce } from '@/lib/commerce-analytics';
import { renderLegendCardPrint } from '@/journey/legend-card';
import { downloadBlob, legendCardFilename } from '@/journey/share';
import { track } from '@/journey/analytics';
import { useI18n } from '@/i18n/useI18n';
import type { JourneyRun } from '@/journey/types';
import { cn } from '@/lib/utils';

// Deep-link params are read ONCE at module load, before any effect can rewrite
// history. The team-code hash sync in this component calls replaceState on
// mount, which would otherwise race the ?seed= read and drop a shared journey.
const JOURNEY_LINK = parseCurrentJourneyLink();

type CategoryFilter =
  | 'all' | 'normal' | 'legendary' | 'mythical' | 'special'
  | 'base-only' | 'mega' | 'gigantamax' | 'regional' | 'paradox' | 'favorites';

const EMPTY_MEMBERS: (TeamMember | null)[] = [null, null, null, null, null, null];

function membersToTeam(members: (TeamMember | null)[]): (Pokemon | null)[] {
  return members.map(m => m ? POKEMON_BY_ID[m.id] || null : null);
}

export default function App() {
  // ---------- Source-of-truth: members ----------
  const [members, setMembers] = useState<(TeamMember | null)[]>(EMPTY_MEMBERS);
  const [teamName, setTeamName] = useState('');
  const [trainer, setTrainer] = useState<TrainerProfile | null>(null);
  const [premium, setPremium] = useState(false);
  // Favourites. A Set for O(1) membership from PokemonCard, persisted as an
  // array (see StorageShape.favorites).
  const [favorites, setFavorites] = useState<Set<number>>(() => new Set());
  // Referentially stable, so PokemonCard's React.memo still skips work. An
  // inline arrow here would re-render all 240 mounted cards on every keystroke.
  const toggleFavorite = useCallback((p: Pokemon) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
      return next;
    });
  }, []);
  // v6: light/dark mode. Default to dark (the original v5 brand vibe), persist
  // in localStorage. We toggle the `.light` / `.dark` class on documentElement
  // so the CSS variables in index.css switch palettes.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('trainerscodex.theme');
    return (stored === 'light' ? 'light' : 'dark');
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    try { localStorage.setItem('trainerscodex.theme', theme); } catch { /* private mode or quota — the theme is already applied to the DOM */ }
  }, [theme]);
  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // Expose pure helpers for the test harness (no secrets) so tests exercise the
  // real compiled bundle instead of a mirror: Showdown round-trip + the
  // game-compatibility layer (Champions / Mega gating).
  useEffect(() => {
    const speciesNames = Object.values(POKEMON_BY_ID).map(p => p.display);
    (window as unknown as { __tc?: unknown }).__tc = {
      parsePokePaste, exportPokePaste,
      analyzeTeamCompatibility, recommendTargetGame, isPokemonAvailableIn,
      computeMatchup, bestMove,
      computeTeamMatchup, buildShareCode, parseShareCode,
      BADGE_REGIONS, badgesForRegion,
      validateHandle, parseProfileRoute, profileUrl,
      shapeProfilePayload, shapeTeamPayload, shapeReportPayload, sanitizeText,
      sanitizeListingTitle: (raw: string | null | undefined) => sanitizeListingTitle(raw, speciesNames),
      checkLegality, teamLegality, isUnrestricted, isLegal, FORMAT_PRESETS, presetById, UNRESTRICTED,
      suggestCounterTeam, generateRandomTeam,
      POKEMON_BY_ID, MAINLINE_GAMES,
      // Test seams: inject an in-memory ProfileClient + drive the /u route
      // without a real backend (the harness aborts all external requests).
      __setProfileClient: (c: ProfileClient | null) => setProfileClient(c),
      __openProfile: (h: string, viewerId?: string | null) => {
        if (viewerId !== undefined) setViewerOverride(viewerId);
        setRouteHandle(h);
      },
    };
  }, []);

  // ---------- Public profiles: route + client ----------
  useEffect(() => {
    const sync = () => setRouteHandle(parseProfileRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getProfileClient().then(c => { if (!cancelled) setProfileClient(prev => prev || c); });
    return () => { cancelled = true; };
  }, []);

  const exitProfile = useCallback(() => {
    setRouteHandle(null);
    try {
      // Drop any /u/<handle> path or hash so the back-action returns to the app.
      const clean = window.location.pathname.replace(/\/u\/[^/?#]+/i, '/') || '/';
      const hash = /(?:^#|[#&])\/?u[/=]/i.test(window.location.hash) ? '' : window.location.hash;
      history.replaceState(null, '', clean + window.location.search + hash);
    } catch { /* replaceState throws on some sandboxed/file:// origins — the URL is cosmetic here */ }
  }, []);

  const [pendingTeam, setPendingTeam] = useState<(TeamMember | null)[] | null>(null);
  // Incoming shared team (`#team=` link). When set, a landing page takes over
  // the screen so the recipient sees what was shared and can battle it against
  // their own team — instead of the team silently loading into the builder.
  const [sharedIncoming, setSharedIncoming] = useState<
    { members: (TeamMember | null)[]; teamName?: string; by?: string } | null
  >(null);
  // Seeded from `?q=` so the static reference pages under /pokemon/<slug> can
  // hand a visitor straight into the builder with that Pokémon already filtered
  // — the whole point of generating them (see scripts/gen-seo-pages.ts). Read
  // once at mount; the param is left in the URL so a refresh is idempotent.
  const [search, setSearch] = useState(initialSearchQuery);
  // Empty-state preset chips: collapsed on phones (see the empty state below).
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [filterTypes, setFType] = useState<PokemonType[]>([]);
  const [filterGens, setFGens] = useState<number[]>([]);
  const [filterRoles, setFRoles] = useState<Role[]>([]);
  const [filterCategory, setFCategory] = useState<CategoryFilter>('all');
  // v6: active team-building format (ruleset). Persisted under its own key so the
  // storage v2 schema stays untouched (same pattern as theme).
  const [ruleset, setRuleset] = useState<Ruleset>(() => {
    if (typeof window === 'undefined') return UNRESTRICTED;
    try {
      const raw = localStorage.getItem('trainerscodex.format');
      if (raw) return { ...UNRESTRICTED, ...JSON.parse(raw) } as Ruleset;
    } catch { /* unreadable or corrupt — fall through to UNRESTRICTED below */ }
    return UNRESTRICTED;
  });
  useEffect(() => {
    try { localStorage.setItem('trainerscodex.format', JSON.stringify(ruleset)); } catch { /* private mode or quota — the ruleset still applies this session */ }
  }, [ruleset]);
  const formatActive = useMemo(() => !isUnrestricted(ruleset), [ruleset]);
  const applyPreset = useCallback((id: string) => setRuleset(presetById(id)), []);
  const toggleRule = useCallback((key: keyof Ruleset) => {
    setRuleset(r => ({ ...r, id: 'custom', label: 'Custom', [key]: !r[key] }));
  }, []);
  const [sortBy, setSortBy] = useState<'id' | 'name' | 'bst' | keyof Stats>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Pokemon | null>(null);
  const [configSlot, setConfigSlot] = useState<number | null>(null);
  const [tcgPokemon, setTcgPokemon] = useState<Pokemon | null>(null);
  const [sheetOpen, setSheet] = useState(false);
  const [chartOpen, setChart] = useState(false);
  const [shareOpen, setShare] = useState(false);
  const [libraryOpen, setLibrary] = useState(false);
  const [helpOpen, setHelp] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const [merchOpen, setMerchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  // Auto-open when the URL is the Journey route or carries a shared seed —
  // a shared link must land on the game, not on the builder.
  const [journeyOpen, setJourneyOpen] = useState(
    () => isEnabled('JOURNEY_MODE')
      && (JOURNEY_LINK.isJourneyRoute || JOURNEY_LINK.seed !== null || JOURNEY_LINK.hadInvalidParams),
  );
  const [session, setSession] = useState<AuthSession | null>(null);
  // v6 public profiles: which /u/<handle> route is active (null = the app), and
  // the resolved ProfileClient (null until the cloud SDK loads, or forever when
  // auth isn't configured). Tests can inject a stub via window.__tc.
  const [routeHandle, setRouteHandle] = useState<string | null>(() => parseProfileRoute());
  const [profileClient, setProfileClient] = useState<ProfileClient | null>(null);
  const [viewerOverride, setViewerOverride] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [showFilters, setSF] = useState(false);
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [undoStack, setUndoStack] = useState<(TeamMember | null)[][]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { t, locale } = useI18n();

  // ---------- Derived team (Pokémon objects) ----------
  const team = useMemo(() => membersToTeam(members), [members]);
  const teamCount = team.filter(Boolean).length;
  const teamFull = team.every(Boolean);
  const teamIds = useMemo(() => new Set(team.filter(Boolean).map(p => p!.id)), [team]);
  // Legality of the current team under the active format. Surfaced as a banner
  // in the team bar so a format change after building flags the offenders.
  const teamLegal = useMemo(() => teamLegality(team, ruleset), [team, ruleset]);
  // Candidate pool for every recommender, narrowed to the active format. When
  // unrestricted we reuse POKEMON_BY_ID by reference (no allocation). Filler /
  // counter / random suggestions all draw from this so they never propose a mon
  // the user couldn't legally add.
  const legalPool = useMemo<Record<number, Pokemon>>(() => {
    if (isUnrestricted(ruleset)) return POKEMON_BY_ID;
    const out: Record<number, Pokemon> = {};
    for (const p of Object.values(POKEMON_BY_ID)) {
      if (isLegal(p, ruleset)) out[p.id] = p;
    }
    return out;
  }, [ruleset]);

  // ---------- Parse URL hash on mount ----------
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      // `#team=` is an INCOMING SHARE: show the landing, don't auto-load.
      const shared = hash.match(/(?:^#|&)team=([0-9a-z,-]+)/);
      if (shared) {
        const parsed = parseShareCode(shared[1]);
        if (parsed && parsed.some(Boolean)) {
          const tn = hash.match(/(?:^#|&)tn=([^&]+)/);
          const by = hash.match(/(?:^#|&)by=([^&]+)/);
          const dec = (s: string | undefined) => {
            if (!s) return undefined;
            try { return decodeURIComponent(s) || undefined; } catch { return undefined; }
          };
          setSharedIncoming({ members: parsed, teamName: dec(tn?.[1]), by: dec(by?.[1]) });
          return; // a share link supersedes the `#t=` resume hash
        }
      }
      // `#t=` is the app's own resume/bookmark hash — load it into the builder.
      const m = hash.match(/(?:^#|&)t=([0-9a-z,-]+)/);
      if (m) {
        const parsed = parseShareCode(m[1]);
        if (parsed) setPendingTeam(parsed);
      }
    } catch { /* a malformed share link must open the app, not an error screen */ }
  }, []);

  // ---------- Resolve pending team ----------
  useEffect(() => {
    if (!pendingTeam) return;
    const fixed: (TeamMember | null)[] = pendingTeam.map(m =>
      m && POKEMON_BY_ID[m.id] ? m : null
    );
    while (fixed.length < 6) fixed.push(null);
    setMembers(fixed.slice(0, 6));
    setPendingTeam(null);
  }, [pendingTeam]);

  // ---------- Sync members → URL hash ----------
  useEffect(() => {
    try {
      const hasAny = members.some(Boolean);
      const cur = window.location.hash;
      if (!hasAny) {
        // Only clear OUR OWN resume hash. On mount this effect runs before the
        // unlock/share boot effects, so clobbering a foreign hash (#unlock=,
        // #team=, #/u/) here would strip it before those effects can read it.
        if (/^#t=/.test(cur)) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return;
      }
      const newHash = `#t=${buildShareCode(members)}`;
      if (cur !== newHash) {
        history.replaceState(null, '', window.location.pathname + window.location.search + newHash);
      }
    } catch { /* see above — the share hash is cosmetic, never load-bearing */ }
  }, [members]);

  // ---------- Load saved teams + restore current from localStorage on mount ----------
  useEffect(() => {
    const stored = loadStorage();
    setSavedTeams(stored.teams);
    if (stored.trainer) setTrainer(stored.trainer);
    if (stored.favorites?.length) setFavorites(new Set(stored.favorites));

    // Premium gating: a signed Stripe license JWT takes precedence over the
    // legacy localStorage `premium` flag (which was the dev-only preview
    // toggle). The license check is structural-only here — server-side
    // verification happens lazily when premium UI opens.
    // Owner quick-unlock: `?unlock=premium` / `#unlock=premium` flips a
    // persistent local override (and `unlock=off` clears it). Applied before
    // the license check so it wins, and persisted under its own key so it
    // survives reloads even on a Worker-backed deploy.
    const unlockAction = applyOwnerUnlock();
    if (unlockAction === 'locked') clearLicense();

    const license = getStoredLicense();
    if (license || hasOwnerUnlock()) {
      setPremium(true);
      if (license) {
        trackCommerce({
          event: 'license_restored',
          daysLeft: Math.max(0, Math.round((license.claims.exp * 1000 - Date.now()) / 86400000)),
        });
        // Weekly server re-check: a cancelled subscription is revoked
        // server-side; this is where a revoked license actually loses premium
        // (soft-fails to 'ok' when offline — never punishes availability).
        void maybeReverifyLicense(license.jwt).then(verdict => {
          if (verdict === 'revoked') {
            setPremium(false);
            toast('premium ended · your subscription is no longer active');
          }
        });
      }
    } else if (stored.premium && !isWorkerConfigured()) {
      // Self-host / no-worker deploy: the preview toggle remains the source
      // of truth. This keeps the bundle's offline UX intact for static hosts.
      setPremium(true);
    }
    if (unlockAction === 'unlocked') {
      toast.success('premium unlocked · preview mode — every premium surface is open');
    } else if (unlockAction === 'locked') {
      setPremium(false);
      toast('premium locked · back to the free experience');
    }

    if (stored.current && !pendingTeam && !members.some(Boolean)) {
      const next = stored.current.members.slice(0, 6) as (TeamMember | null)[];
      while (next.length < 6) next.push(null);
      if (next.some(Boolean)) {
        setMembers(next);
        setTeamName(stored.current.name || '');
      }
    }
    setHasLoadedStorage(true);

    // Merch checkout return (?merch=success|cancel) — a payment-mode session,
    // no license to mint. Fulfillment runs server-side off the webhook; the
    // toast is the buyer's acknowledgment.
    const merchReturn = consumeMerchReturn();
    if (merchReturn === 'success') {
      toast.success('order placed · it prints and ships to the address you gave at checkout');
    } else if (merchReturn === 'cancel') {
      toast('checkout cancelled · your design is still here whenever you are ready');
    }

    // Stripe Checkout return path — if we landed here with ?session_id=...,
    // exchange it for a JWT and flip premium on. Fires asynchronously; the
    // toast acknowledges the flow without blocking initial render.
    void (async () => {
      const claims = await bootstrapFromCheckoutReturn();
      if (!claims) return;
      if (claims.plan === 'credits') {
        toast.success('credits added · ready to generate in AI Studio');
      } else {
        setPremium(true);
        toast.success('premium unlocked · welcome to the pack');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Persist to localStorage ----------
  useEffect(() => {
    if (!hasLoadedStorage) return;
    saveStorage({
      teams: savedTeams,
      current: { members, name: teamName },
      trainer,
      premium: premium || undefined,
      favorites: [...favorites],
    });
  }, [members, teamName, savedTeams, trainer, premium, favorites, hasLoadedStorage]);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const inputting = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;

      if (e.key === '/' && !inputting) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '?' && !inputting) {
        setHelp(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !inputting) {
        e.preventDefault();
        setUndoStack(s => {
          if (s.length === 0) return s;
          const last = s[s.length - 1];
          setMembers(last);
          toast('undid last change');
          return s.slice(0, -1);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ---------- Auth: load session + subscribe ----------
  useEffect(() => {
    if (!auth.isConfigured) return;
    void auth.getSession().then(setSession);
    const unsub = auth.onAuthChange(s => {
      setSession(s);
      if (s) toast.success(`signed in · ${s.name || s.email}`);
      else toast('signed out');
    });
    return unsub;
  }, []);

  // ---------- Cloud sync: pull on sign-in, push on changes ----------
  useEffect(() => {
    if (!session) return;
    // Pull cloud data once on sign-in
    void (async () => {
      setSyncing(true);
      try {
        const cloud = await auth.fetchCloudData();
        if (cloud && cloud.updatedAt > (lastSyncAt ?? 0)) {
          if (cloud.trainer) setTrainer(cloud.trainer);
          if (cloud.teams.length > 0) setSavedTeams(cloud.teams);
          setLastSyncAt(cloud.updatedAt);
          toast.success('cloud profile loaded');
        } else {
          // First-time sign-in — push local data as initial cloud state
          await auth.saveCloudData({ trainer, teams: savedTeams, updatedAt: Date.now() });
          setLastSyncAt(Date.now());
        }
      } catch (e) {
        console.warn('cloud sync error', e);
      } finally {
        setSyncing(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

  // Debounced push when local data changes while signed in
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(async () => {
      try {
        setSyncing(true);
        await auth.saveCloudData({ trainer, teams: savedTeams, updatedAt: Date.now() });
        setLastSyncAt(Date.now());
      } catch (e) {
        console.warn('cloud push error', e);
      } finally {
        setSyncing(false);
      }
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainer, savedTeams, session?.userId]);

  const handleManualSync = useCallback(async () => {
    if (!session) return;
    setSyncing(true);
    try {
      await auth.saveCloudData({ trainer, teams: savedTeams, updatedAt: Date.now() });
      setLastSyncAt(Date.now());
      toast.success('synced to cloud');
    } catch {
      toast.error('sync failed');
    } finally {
      setSyncing(false);
    }
  }, [session, trainer, savedTeams]);

  // ---------- Derived list ----------
  // Deferred search: filtering 1,307 entries is cheap, but the re-render it
  // triggers isn't. Deferring lets React keep the input responsive and batch
  // the grid update behind it (React 19 concurrent rendering).
  const deferredSearch = useDeferredValue(search);
  const visible = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    let list = POKEMON_LIST.map(p => POKEMON_BY_ID[p.id]).filter(Boolean);
    if (q) list = list.filter(p => p.name.includes(q) || String(p.id) === q || p.display.toLowerCase().includes(q));
    if (filterTypes.length) list = list.filter(p => filterTypes.every(t => p.types.includes(t)));
    if (filterGens.length) list = list.filter(p => filterGens.includes(getGen(p.id)));
    if (filterRoles.length) list = list.filter(p => filterRoles.every(r => p.roles.includes(r)));
    if (filterCategory === 'legendary') list = list.filter(p => p.legendary);
    else if (filterCategory === 'mythical') list = list.filter(p => p.mythical);
    else if (filterCategory === 'special') list = list.filter(p => p.legendary || p.mythical);
    else if (filterCategory === 'normal') list = list.filter(p => !p.legendary && !p.mythical && !p.form);
    else if (filterCategory === 'base-only') list = list.filter(p => !p.form);
    else if (filterCategory === 'mega') list = list.filter(p => p.form === 'mega' || p.form === 'primal');
    else if (filterCategory === 'gigantamax') list = list.filter(p => p.form === 'gigantamax');
    else if (filterCategory === 'regional') list = list.filter(p => ['alolan', 'galarian', 'hisuian', 'paldean'].includes(p.form || ''));
    else if (filterCategory === 'favorites') list = list.filter(p => favorites.has(p.id));
    else if (filterCategory === 'paradox') {
      // Paradox Pokémon don't have a "form" tag — they're regular species in the 984-1024 range
      const PARADOX_IDS = new Set([984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 1005, 1006, 1007, 1008, 1009, 1010, 1020, 1021, 1022, 1023]);
      list = list.filter(p => PARADOX_IDS.has(p.id));
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === 'name') return a.display.localeCompare(b.display) * dir;
      if (sortBy === 'id') return (a.id - b.id) * dir;
      if (sortBy === 'bst') return (a.bst - b.bst) * dir;
      return ((a.stats[sortBy as keyof Stats] ?? 0) - (b.stats[sortBy as keyof Stats] ?? 0)) * dir;
    });
    return list;
  }, [deferredSearch, filterTypes, filterGens, filterRoles, filterCategory, sortBy, sortDir, favorites]);

  // ---------- Windowed grid ----------
  // Mounting all 1,307 cards at once was the app's single biggest jank source:
  // ~1.3k component trees + sprite <img> nodes on first paint. Render the
  // first window immediately and grow it as the sentinel scrolls into view.
  // visible.length (the "N results" counter) is untouched by this.
  const GRID_WINDOW = 240;
  const [renderCount, setRenderCount] = useState(GRID_WINDOW);
  // Reset the window when the result set changes — done during render (React's
  // documented "adjust state when props change" pattern) rather than in an
  // effect, so the shrink happens in the same pass with no cascading render.
  const [prevVisible, setPrevVisible] = useState(visible);
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    setRenderCount(GRID_WINDOW);
  }
  const gridSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gridSentinelRef.current;
    if (!el || renderCount >= visible.length) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setRenderCount(c => Math.min(c + GRID_WINDOW, visible.length));
      }
    }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [renderCount, visible.length]);
  const renderedGrid = useMemo(() => visible.slice(0, renderCount), [visible, renderCount]);

  // ---------- Undo helper ----------
  const pushUndo = useCallback((prev: (TeamMember | null)[]) => {
    setUndoStack(s => [...s.slice(-7), prev]);
  }, []);

  // ---------- Team actions ----------
  const addToTeam = useCallback((p: Pokemon) => {
    const legality = checkLegality(p, ruleset);
    if (!legality.legal) {
      toast.error(`${p.display} is banned · ${legality.reasons.join(' · ')}`);
      return;
    }
    setMembers(prev => {
      if (prev.some(m => m?.id === p.id)) return prev;
      const slot = prev.findIndex(m => m === null);
      if (slot === -1) return prev;
      pushUndo(prev);
      const next = [...prev];
      next[slot] = { id: p.id, shiny: false };
      if (next.every(Boolean)) setTimeout(() => toast.success('team complete · ready to analyze'), 50);
      return next;
    });
  }, [pushUndo, ruleset]);

  const removeFromTeam = useCallback((idx: number) => {
    setMembers(prev => {
      if (!prev[idx]) return prev;
      pushUndo(prev);
      const n = [...prev]; n[idx] = null; return n;
    });
  }, [pushUndo]);

  const updateMember = useCallback((idx: number, next: TeamMember) => {
    setMembers(prev => {
      pushUndo(prev);
      const n = [...prev]; n[idx] = next; return n;
    });
  }, [pushUndo]);

  const clearTeam = () => {
    setMembers(prev => { pushUndo(prev); return EMPTY_MEMBERS; });
    setTeamName('');
  };

  const loadStarter = useCallback((starter: { ids: number[]; label: string }) => {
    pushUndo(members);
    const next: (TeamMember | null)[] = starter.ids.map(id =>
      POKEMON_BY_ID[id] ? { id, shiny: false } : null
    );
    while (next.length < 6) next.push(null);
    setMembers(next);
    setTeamName(starter.label);
  }, [members, pushUndo]);

  const importShowdownTeam = useCallback((parsed: TeamMember[]) => {
    pushUndo(members);
    const next: (TeamMember | null)[] = parsed.slice(0, 6);
    while (next.length < 6) next.push(null);
    setMembers(next);
  }, [members, pushUndo]);

  const loadRandom = useCallback(() => {
    pushUndo(members);
    // Draw from the format-legal pool. A BST cap means the default 450 floor
    // would empty the pool, so drop the floor when a cap is active; pass the
    // mono-type constraint through to keep the roll on-format.
    const picks = generateRandomTeam(legalPool, {
      minBST: ruleset.bstCap != null ? 0 : undefined,
      monotype: ruleset.monoType ?? undefined,
    });
    if (picks.length > 0) {
      const padded: (TeamMember | null)[] = picks.map(p => ({ id: p.id, shiny: false }));
      while (padded.length < 6) padded.push(null);
      setMembers(padded);
      setTeamName(formatActive ? `Random · ${ruleset.label}` : 'Random Roll');
      toast('rolled a random team');
    } else {
      toast.warning('no legal mons for this format — loosen the rules');
    }
  }, [members, pushUndo, legalPool, ruleset, formatActive]);

  const loadCounterTeam = useCallback(() => {
    const counters = suggestCounterTeam(team, legalPool);
    if (counters.length < 6) {
      toast.warning('not enough data to build counter — fill more slots');
      return;
    }
    pushUndo(members);
    setMembers(counters.slice(0, 6).map(c => ({ id: c.p.id, shiny: false })));
    setTeamName('Counter Team');
    toast.success('built counter team');
    setSheet(false);
  }, [team, members, pushUndo, legalPool]);

  // ---------- Journey Mode handoffs ----------

  /**
   * CTA 1 — load the finished career's six into the builder.
   *
   * This is the leg of the funnel a clone cannot copy: the Legend Card ends in
   * a real, tunable team inside a real analyzer. Shinies carry over; movesets
   * are left to the builder's STAB-aware auto-fill.
   */
  const handleJourneyHandoff = useCallback((run: JourneyRun) => {
    pushUndo(members);
    const next: (TeamMember | null)[] = run.roster
      .slice(0, 6)
      .map(entry => (POKEMON_BY_ID[entry.id] ? { id: entry.id, shiny: entry.shiny } : null));
    while (next.length < 6) next.push(null);
    setMembers(next);
    setTeamName(`${run.setup.trainerName} · ${t(run.verdict.titleKey, { region: '' }).trim()}`);
    setJourneyOpen(false);
    track({
      event: 'builder_handoff',
      score: run.score,
      verdict: run.verdict.id,
      seed: run.setup.seed,
    });
    toast.success(t('journey.cta.builder'));
  }, [members, pushUndo, t]);

  /**
   * CTA 2 — print the Legend Card. Reached only when JOURNEY_MERCH_CTA is on.
   *
   * Mirrors the shipped Merch Studio order flow: generate the 300 DPI print
   * file, hand it to the user, and open the studio so they can pick a product.
   * The one-click Printful upload path needs the R2 bucket finished — see
   * Sprint 0 item #2 in docs/JOURNEY_MODE.md.
   */
  const handleJourneyMerch = useCallback(async (run: JourneyRun) => {
    track({
      event: 'merch_cta_click',
      score: run.score,
      verdict: run.verdict.id,
      seed: run.setup.seed,
    });
    try {
      const printBlob = await renderLegendCardPrint({ run, locale, target: 'poster11x14' });
      downloadBlob(printBlob, legendCardFilename(run.setup.trainerName, run.setup.seed));
      handleJourneyHandoff(run);
      setMerchOpen(true);
    } catch {
      toast.error(t('journey.result.renderFailed'));
    }
  }, [locale, handleJourneyHandoff, t]);

  // ---------- Library actions ----------
  const saveCurrentToLibrary = useCallback((name: string) => {
    // v6: free tier capped at 3 saved teams. Premium unlimited.
    // Reason: premium-revenue lever. Anyone building 4+ teams is a power
    // user and the $4.99/mo conversion threshold is well-justified.
    if (!premium && savedTeams.length >= 3) {
      trackCommerce({ event: 'paywall_shown', surface: 'saved-teams' });
      toast.error('saved-team limit · upgrade to Premium for unlimited');
      return;
    }
    const entry: SavedTeam = {
      id: genId(),
      name: name || teamName || 'Untitled',
      members: [...members],
      createdAt: Date.now(),
    };
    setSavedTeams(s => [entry, ...s]);
    setTeamName(entry.name);
    toast.success(`saved "${entry.name}"`);
  }, [members, teamName, premium, savedTeams.length]);

  const loadFromLibrary = useCallback((entry: SavedTeam) => {
    pushUndo(members);
    const next: (TeamMember | null)[] = [...(entry.members || [])];
    while (next.length < 6) next.push(null);
    setMembers(next.slice(0, 6));
    setTeamName(entry.name);
    setLibrary(false);
    toast(`loaded "${entry.name}"`);
  }, [members, pushUndo]);

  const deleteFromLibrary = useCallback((id: string) => {
    setSavedTeams(s => s.filter(t => t.id !== id));
    toast('team deleted');
  }, []);

  const renameInLibrary = useCallback((id: string, newName: string) => {
    setSavedTeams(s => s.map(t => t.id === id ? { ...t, name: newName } : t));
  }, []);

  // ---------- Analysis (over resolved team) ----------
  const defRows = useMemo(() => computeDefensive(team), [team]);
  const offRows = useMemo(() => computeOffensive(team), [team]);
  const statAgg = useMemo(() => computeStats(team), [team]);
  const threats = useMemo(() => computeThreats(team, defRows), [team, defRows]);
  const uncovered = useMemo(() => computeUncovered(team, offRows), [team, offRows]);
  const suggestions = useMemo(() => suggestFillers(team, legalPool, defRows, uncovered), [team, legalPool, defRows, uncovered]);
  const counters = useMemo(() => suggestCounterTeam(team, legalPool).slice(0, 6), [team, legalPool]);

  const undoLast = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setMembers(last);
    setUndoStack(s => s.slice(0, -1));
    toast('undid last change');
  };

  const onConfigureSlot = (idx: number) => {
    if (members[idx]) setConfigSlot(idx);
  };

  // ---------- Incoming shared team takes over the whole screen ----------
  if (sharedIncoming) {
    const loadShared = () => {
      const fixed = sharedIncoming.members.map(m => (m && POKEMON_BY_ID[m.id] ? m : null));
      while (fixed.length < 6) fixed.push(null);
      setMembers(fixed.slice(0, 6));
      if (sharedIncoming.teamName) setTeamName(sharedIncoming.teamName);
      setSharedIncoming(null);
      toast.success('team loaded · tweak it, analyze it, or make it yours');
    };
    return (
      <SharedTeamLanding
        members={sharedIncoming.members}
        teamName={sharedIncoming.teamName}
        by={sharedIncoming.by}
        myMembers={members}
        onLoad={loadShared}
        onDismiss={() => setSharedIncoming(null)}
      />
    );
  }

  // ---------- Public profile route takes over the whole screen ----------
  if (routeHandle) {
    return (
      <PublicProfileView
        handle={routeHandle}
        client={profileClient}
        viewerId={viewerOverride ?? session?.userId ?? null}
        onExit={exitProfile}
      />
    );
  }

  return (
    <div className="min-h-screen w-full text-foreground relative bg-background crt-scan crt-vignette grain">
      <Toaster
        position="bottom-center"
        theme="dark"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: '11px',
          },
        }}
      />

      {/* ============== HEADER ============== */}
      {/* Same `viewport-fit=cover` story as the bottom bar: in standalone mode
          with a translucent status bar, the header rendered under the notch. */}
      <header className="border-b sticky top-0 z-30 backdrop-blur-md bg-background/92 pt-[env(safe-area-inset-top)]" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" style={{ animationDelay: '0.4s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 pulse-dot" style={{ animationDelay: '0.8s' }} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg leading-none flicker truncate text-primary">
                trainer<span className="text-foreground/40">'</span>s codex
              </h1>
              {teamName ? (
                <p className="font-mono text-[10px] mt-0.5 truncate text-foreground/70">
                  <span className="text-muted-foreground">// </span>{teamName.toLowerCase()}
                </p>
              ) : trainer?.name ? (
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5 hidden lg:block">
                  <User size={10} className="inline mr-0.5" /> {trainer.name}
                </p>
              ) : (
                /* Decorative only, and the first thing to give when space is
                   tight: at 820px with 36px touch buttons it wrapped to three
                   lines and squeezed the wordmark down to "tr…". Held back
                   until 1024px, where the row has room to spare. */
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5 hidden lg:block">v5.0 · team analyzer</p>
              )}
            </div>
          </div>
          <TooltipProvider delayDuration={150}>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Desktop toolbar: the full icon row, ≥1024px only.
                  This used to break at 640px, which put all 15 controls on
                  tablets too. They fit there only because they were 32px and the
                  wordmark was allowed to collapse — at 768px the cluster measures
                  705px against a 768px viewport, so the brand truncated to "tr…"
                  and its subtitle wrapped to three lines. Every overflow test
                  still passed, because the header absorbed the pressure by
                  shrinking rather than scrolling.
                  Tablets now get the same overflow menu phones get: it was
                  already built, already tested, and reads better than 15 cramped
                  targets. The full row returns at 1024px where it genuinely fits. */}
              <div className="hidden lg:flex items-center gap-1.5">
              {undoStack.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={undoLast} className="w-8 h-8 hidden lg:flex" aria-label="Undo">
                      <RotateCcw size={13} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Undo (⌘Z)</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={toggleTheme} className="w-8 h-8" aria-label="Toggle theme">
                    {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setTrainerOpen(true)}
                    className={cn('w-8 h-8', trainer && 'border-primary text-primary')}
                    aria-label={trainer?.name ? `Profile · ${trainer.name}` : 'Trainer profile'}
                  >
                    <User size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{trainer?.name ? `Profile · ${trainer.name}` : 'Trainer profile'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setSignInOpen(true)}
                    className={cn('w-8 h-8', session && 'border-emerald-500 text-emerald-500')}
                    aria-label={session ? `Signed in as ${session.name || session.email}` : 'Sign in for cloud sync'}
                  >
                    {session ? <Cloud size={13} /> : <LogIn size={13} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{session ? `Signed in as ${session.name || session.email}` : 'Sign in for cloud sync'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setPublishOpen(true)}
                    className="w-8 h-8 hidden lg:flex"
                    aria-label="Publish public profile"
                  >
                    <Globe size={13} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Publish a public profile</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setLibrary(true)}
                    className={cn('w-8 h-8', savedTeams.length > 0 && 'border-primary text-primary')}
                    aria-label={savedTeams.length > 0 ? `Library (${savedTeams.length})` : 'Library'}
                  >
                    <FolderOpen size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Library {savedTeams.length > 0 ? `(${savedTeams.length})` : ''}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={loadRandom} className="w-8 h-8" aria-label="Random team">
                    <Dices size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Random team</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setChart(true)} className="w-8 h-8" aria-label="Type chart">
                    <Grid3x3 size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Type chart</TooltipContent>
              </Tooltip>
              {isEnabled('JOURNEY_MODE') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="icon" onClick={() => setJourneyOpen(true)}
                      className="w-8 h-8 border-primary/60 text-primary"
                      data-testid="journey-open"
                      aria-label={`${t('journey.title')} · ${t('journey.tagline')}`}
                    >
                      <Compass size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('journey.title')} · {t('journey.tagline')}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setPosterOpen(true)} disabled={teamCount === 0}
                    className={cn('w-8 h-8', teamCount > 0 && 'border-primary text-primary')}
                    aria-label="Poster studio"
                  >
                    <Wand2 size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Poster studio</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setMerchOpen(true)} disabled={teamCount === 0}
                    className={cn('w-8 h-8', teamCount > 0 && 'border-primary text-primary')}
                    aria-label="Merch studio · order shirts, posters, mugs"
                  >
                    <ShoppingBag size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Merch studio · order shirts, posters, mugs</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setAiOpen(true)}
                    data-testid="ai-studio-btn"
                    className={cn('w-8 h-8', premium && 'border-primary text-primary')}
                    aria-label="AI Studio · trainer card + team art"
                  >
                    <Sparkles size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI Studio · trainer card + team art</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setImportOpen(true)}
                    className="w-8 h-8" data-testid="showdown-btn"
                    aria-label="Import / export · Showdown · PokePaste"
                  >
                    <ClipboardList size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import / export · Showdown · PokePaste</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setShare(true)} disabled={teamCount === 0}
                    className={cn('w-8 h-8', teamCount > 0 && 'border-primary text-primary')}
                    aria-label="Share team"
                  >
                    <Share2 size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share team</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setHelp(true)} className="w-8 h-8" aria-label="Help">
                    <HelpCircle size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Help (?)</TooltipContent>
              </Tooltip>
              </div>{/* end desktop toolbar */}

              {/* Mobile overflow menu (<640px): every secondary action as a
                  labeled item so the header never overflows a phone viewport. */}
              <div className="flex lg:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {/* The collapsed header carries two controls, so this one can
                        take the full 44px touch target the crowded desktop row
                        cannot afford. */}
                    <Button variant="outline" size="icon" className="w-11 h-11" data-testid="more-actions" aria-label="More actions">
                      <MoreHorizontal size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 font-mono text-xs">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">// actions</DropdownMenuLabel>
                    {isEnabled('JOURNEY_MODE') && (
                      <DropdownMenuItem onSelect={() => setJourneyOpen(true)} data-testid="journey-open-mobile"><Compass size={14} className="mr-2" /> {t('journey.title')}</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setAiOpen(true)}><Sparkles size={14} className="mr-2" /> AI Studio</DropdownMenuItem>
                    <DropdownMenuItem disabled={teamCount === 0} onSelect={() => setPosterOpen(true)}><Wand2 size={14} className="mr-2" /> Poster studio</DropdownMenuItem>
                    <DropdownMenuItem disabled={teamCount === 0} onSelect={() => setMerchOpen(true)}><ShoppingBag size={14} className="mr-2" /> Merch studio</DropdownMenuItem>
                    <DropdownMenuItem disabled={teamCount === 0} onSelect={() => setShare(true)}><Share2 size={14} className="mr-2" /> Share team</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setImportOpen(true)}><ClipboardList size={14} className="mr-2" /> Import / export</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setLibrary(true)}><FolderOpen size={14} className="mr-2" /> Library{savedTeams.length > 0 ? ` (${savedTeams.length})` : ''}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={loadRandom}><Dices size={14} className="mr-2" /> Random team</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setChart(true)}><Grid3x3 size={14} className="mr-2" /> Type chart</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setTrainerOpen(true)}><User size={14} className="mr-2" /> {trainer?.name ? `Profile · ${trainer.name}` : 'Trainer profile'}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSignInOpen(true)}>{session ? <Cloud size={14} className="mr-2" /> : <LogIn size={14} className="mr-2" />} {session ? 'Cloud sync' : 'Sign in'}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPublishOpen(true)}><Globe size={14} className="mr-2" /> Publish profile</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={toggleTheme}>{theme === 'dark' ? <Sun size={14} className="mr-2" /> : <Moon size={14} className="mr-2" />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}</DropdownMenuItem>
                    {undoStack.length > 0 && (
                      <DropdownMenuItem onSelect={undoLast}><RotateCcw size={14} className="mr-2" /> Undo</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setHelp(true)}><HelpCircle size={14} className="mr-2" /> Help</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button
                onClick={() => setSheet(true)} disabled={teamCount === 0}
                className="font-mono text-xs font-bold ml-1"
              >
                <BarChart3 size={12} className="mr-1.5" />
                {/* sr-only rather than hidden: below lg the icon is the whole
                    button, and a hidden span is not an accessible name. */}
                <span className="sr-only lg:not-sr-only">Analyze</span>
              </Button>
            </div>
          </TooltipProvider>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-4 pb-32">
        {/* ============== EMPTY STATE ============== */}
        {teamCount === 0 && (
          <section className="mb-6 fade-up">
            <div className="border rounded-lg p-4 sm:p-6 corner-bracket relative"
                 style={{ borderColor: 'hsl(var(--border))', background: 'linear-gradient(180deg, hsl(var(--primary)/0.06), transparent 70%)' }}>
              <div className="font-mono text-[10px] uppercase tracking-wider mb-2 text-primary">// status: awaiting team selection</div>
              <h2 className="font-display text-2xl sm:text-3xl mb-2 leading-tight">build your six</h2>
              {/* Was a 60-word feature dump that ran six lines on a 390px phone and
                  pushed the first Pokémon card past 1,022px — 1.2 screens of scrolling
                  before the app showed what it does. The full list still lives in
                  "How it works", one tap away, which is where someone who wants it looks. */}
              <p className="text-sm text-muted-foreground mb-4 max-w-xl leading-relaxed">
                All {POKEMON_TOTAL} Pokémon — every form, shiny and Tera type. Build a six,
                watch its coverage score live, then turn it into a poster or a shirt.
              </p>

              {/* Journey Mode is the most engaging thing in the app and, on a phone,
                  it was the hardest to reach: the header collapses to two buttons
                  under 640px, so starting a run meant tapping "More actions", then
                  finding it in a 12-item menu. The empty state is the first thing
                  anyone sees, so the run starts here instead. */}
              {isEnabled('JOURNEY_MODE') && (
                <button
                  type="button"
                  onClick={() => setJourneyOpen(true)}
                  data-testid="journey-open-hero"
                  className="w-full mb-2 flex items-center gap-3 rounded-md border border-primary/60 bg-primary/10 px-3 py-2.5 text-left hover:border-primary hover:bg-primary/15 transition-colors"
                >
                  <Compass size={18} className="text-primary shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs uppercase tracking-wider text-primary">
                      {t('journey.title')}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground truncate">
                      // a whole career in 3 minutes
                    </span>
                  </span>
                  <ChevronDown size={16} className="ml-auto shrink-0 -rotate-90 text-primary/70" />
                </button>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <QuickStart onClick={loadRandom} icon={<Dices size={14} />} label="Random" sub="diverse roll" primary />
                <QuickStart onClick={() => searchRef.current?.focus()} icon={<Search size={14} />} label="Search" sub="press /" />
                <QuickStart onClick={() => setTrainerOpen(true)} icon={<User size={14} />} label={trainer ? 'Trainer' : 'Create trainer'} sub={trainer?.name || 'optional'} />
                <QuickStart onClick={() => setHelp(true)} icon={<HelpCircle size={14} />} label="How it works" sub="quick tour" />
              </div>

              {/* 20 preset chips are a great desktop shortcut and a wall on a phone:
                  they wrapped to ten rows and buried the search box below the fold.
                  Collapsed under a single tap at <640px, always open from `sm:` up.
                  CSS-driven rather than a width check so there is no resize listener
                  and no flash of the wrong state on first paint. */}
              <button
                type="button"
                onClick={() => setPresetsOpen(v => !v)}
                aria-expanded={presetsOpen}
                data-testid="toggle-presets"
                className="sm:hidden w-full min-h-11 flex items-center justify-between gap-2 rounded-md border px-3 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
              >
                <span>// {THEMED_TEAMS.length + STARTER_TEAMS.length} preset teams</span>
                <ChevronDown size={14} className={presetsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>

              <div className={presetsOpen ? 'block pt-3 sm:pt-0' : 'hidden sm:block'}>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">// themed presets</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {THEMED_TEAMS.map(s => (
                    <Button key={s.id} variant="outline" size="sm"
                            onClick={() => loadStarter(s)}
                            className="font-mono text-xs hover:border-primary">
                      {s.label}
                    </Button>
                  ))}
                </div>

                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">// by region</div>
                <div className="flex flex-wrap gap-1.5">
                  {STARTER_TEAMS.map(s => (
                    <Button key={s.id} variant="outline" size="sm"
                            onClick={() => loadStarter(s)}
                            className="font-mono text-xs hover:border-primary">
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ============== SEARCH + FILTERS ============== */}
        <div className="space-y-3">
          {/* Wraps at <640px so the search field gets its own full-width row.
              Sharing one row with the filter and sort controls squeezed it to
              ~150px on a 390px phone, which clipped the placeholder mid-word.
              The `/` hint is dropped on touch, where there is no keyboard to
              press it on. */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-full sm:w-auto sm:flex-1 order-first sm:order-none">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search by name or #"
                className="pl-9 font-mono"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSF(s => !s)}
                    data-testid="toggle-filters"
                    className={cn('font-mono text-xs', showFilters && 'border-primary text-primary')}>
              <FilterIcon size={12} className="mr-1" />
              <span className="sr-only sm:not-sr-only">filters</span>
              {(filterTypes.length + filterGens.length + filterRoles.length + (filterCategory !== 'all' ? 1 : 0)) > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 py-0 text-[10px]">
                  {filterTypes.length + filterGens.length + filterRoles.length + (filterCategory !== 'all' ? 1 : 0)}
                </span>
              )}
            </Button>
            <Select value={`${sortBy}:${sortDir}`} onValueChange={(v) => {
              const [by, dir] = v.split(':');
              setSortBy(by as typeof sortBy);
              setSortDir(dir as typeof sortDir);
            }}>
              <SelectTrigger aria-label="Sort order" className="w-auto sm:w-[150px] font-mono text-xs h-9">
                <ArrowUpDown size={12} className="mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id:asc" className="font-mono text-xs">pokédex ↑</SelectItem>
                <SelectItem value="id:desc" className="font-mono text-xs">pokédex ↓</SelectItem>
                <SelectItem value="name:asc" className="font-mono text-xs">name a–z</SelectItem>
                <SelectItem value="name:desc" className="font-mono text-xs">name z–a</SelectItem>
                <SelectItem value="bst:desc" className="font-mono text-xs">bst high → low</SelectItem>
                <SelectItem value="bst:asc" className="font-mono text-xs">bst low → high</SelectItem>
                <SelectItem value="atk:desc" className="font-mono text-xs">attack</SelectItem>
                <SelectItem value="spa:desc" className="font-mono text-xs">sp. atk</SelectItem>
                <SelectItem value="spe:desc" className="font-mono text-xs">speed</SelectItem>
                <SelectItem value="hp:desc" className="font-mono text-xs">hp</SelectItem>
                <SelectItem value="def:desc" className="font-mono text-xs">defense</SelectItem>
                <SelectItem value="spd:desc" className="font-mono text-xs">sp. def</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showFilters && (
            <div className="border rounded-md p-3 fade-up space-y-3" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}>
              <FilterGroup label="format · preset">
                {FORMAT_PRESETS.map(preset => {
                  const active = ruleset.id === preset.id;
                  return (
                    <button key={preset.id}
                            data-format-preset={preset.id}
                            title={preset.description}
                            onClick={() => applyPreset(preset.id)}
                            className={cn(
                              'font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
                              active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary'
                            )}>
                      {preset.label}
                    </button>
                  );
                })}
              </FilterGroup>
              <FilterGroup label="format · custom rules">
                {([
                  ['noMega', 'no megas'],
                  ['noPrimal', 'no primals'],
                  ['noGigantamax', 'no g-max'],
                  ['noRegional', 'no regional'],
                  ['noLegendary', 'no legendary'],
                  ['noMythical', 'no mythical'],
                  ['noParadox', 'no paradox'],
                  ['noUltraBeast', 'no ultra beasts'],
                  ['noRestricted', 'no restricteds'],
                ] as [keyof Ruleset, string][]).map(([key, label]) => {
                  const active = !!ruleset[key];
                  return (
                    <button key={key}
                            data-format-rule={key}
                            onClick={() => toggleRule(key)}
                            className={cn(
                              'font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
                              active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary'
                            )}>
                      {label}
                    </button>
                  );
                })}
                <Select
                  value={ruleset.monoType ?? '_any'}
                  onValueChange={(v) => setRuleset(r => ({
                    ...r, id: 'custom', label: 'Custom',
                    monoType: v === '_any' ? null : (v as PokemonType),
                  }))}>
                  <SelectTrigger data-testid="format-monotype" aria-label="Monotype restriction" className="w-auto h-7 font-mono text-[10px] uppercase tracking-wider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_any" className="font-mono text-[10px]">any type</SelectItem>
                    {TYPES.map(t => (
                      <SelectItem key={t} value={t} className="font-mono text-[10px]">mono-{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  data-testid="format-bstcap"
                  placeholder="bst cap"
                  value={ruleset.bstCap ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setRuleset(r => ({
                      ...r, id: 'custom', label: 'Custom',
                      bstCap: Number.isFinite(n) && n > 0 ? n : null,
                    }));
                  }}
                  className="w-24 h-7 font-mono text-[10px]"
                />
                {formatActive && (
                  <button
                    data-testid="format-clear"
                    onClick={() => setRuleset(UNRESTRICTED)}
                    className="font-mono text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition uppercase tracking-wider">
                    clear format
                  </button>
                )}
              </FilterGroup>
              <FilterGroup label="category">
                {([
                  ['all', 'all'],
                  ['base-only', 'base only'],
                  ['normal', 'normal'],
                  ['legendary', 'legendary'],
                  ['mythical', 'mythical'],
                  ['mega', 'mega · primal'],
                  ['gigantamax', 'gigantamax'],
                  ['regional', 'regional'],
                  ['paradox', 'paradox'],
                  // Label carries the count so the chip is self-explanatory
                  // when the list is empty — otherwise clicking it just shows
                  // "0 results" with no hint why.
                  ['favorites', favorites.size ? `♥ favorites (${favorites.size})` : '♥ favorites'],
                ] as [CategoryFilter, string][]).map(([c, label]) => {
                  const active = filterCategory === c;
                  return (
                    <button key={c}
                            data-testid={`cat-${c}`}
                            onClick={() => setFCategory(c)}
                            className={cn(
                              'font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
                              active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary'
                            )}>
                      {label}
                    </button>
                  );
                })}
              </FilterGroup>
              <FilterGroup label="types">
                {TYPES.map(t => {
                  const active = filterTypes.includes(t);
                  return (
                    <button key={t}
                            onClick={() => setFType(p => active ? p.filter(x => x !== t) : [...p, t])}
                            className={cn(
                              'transition rounded',
                              active ? 'ring-1 ring-primary' : 'opacity-70 hover:opacity-100'
                            )}>
                      <TypePill type={t} />
                    </button>
                  );
                })}
              </FilterGroup>
              <FilterGroup label="generations">
                {GENERATIONS.map(g => {
                  const active = filterGens.includes(g.num);
                  return (
                    <button key={g.num}
                            onClick={() => setFGens(p => active ? p.filter(x => x !== g.num) : [...p, g.num])}
                            className={cn(
                              'font-mono text-[10px] px-2 py-1 rounded border transition',
                              active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary'
                            )}>
                      gen {g.num} · {g.label}
                    </button>
                  );
                })}
              </FilterGroup>
              <FilterGroup label="roles">
                {ROLES.map(r => {
                  const active = filterRoles.includes(r);
                  return (
                    <button key={r}
                            onClick={() => setFRoles(p => active ? p.filter(x => x !== r) : [...p, r])}
                            className={cn(
                              'font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
                              active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary'
                            )}>
                      {r}
                    </button>
                  );
                })}
              </FilterGroup>
              {(filterTypes.length + filterGens.length + filterRoles.length + (filterCategory !== 'all' ? 1 : 0)) > 0 && (
                <Button variant="ghost" size="sm" onClick={() => { setFType([]); setFGens([]); setFRoles([]); setFCategory('all'); }}
                        className="font-mono text-[10px] text-muted-foreground hover:text-destructive">
                  clear all filters
                </Button>
              )}
            </div>
          )}

          <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-2 justify-between">
            <span>{visible.length} result{visible.length === 1 ? '' : 's'}</span>
            {teamCount > 0 && (
              <span className="text-primary">{teamCount}/6 in team</span>
            )}
          </div>
        </div>

        {/* ============== GRID ============== */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {renderedGrid.map(p => {
            const legality = formatActive ? checkLegality(p, ruleset) : null;
            return (
              <PokemonCard key={p.id} p={p}
                onSelect={setSelected}
                onAdd={addToTeam}
                onToggleFavorite={toggleFavorite}
                favorite={favorites.has(p.id)}
                inTeam={teamIds.has(p.id)}
                teamFull={teamFull}
                illegal={legality ? !legality.legal : false}
                illegalReason={legality?.reasons.join(' · ')} />
            );
          })}
        </div>
        {/* Sentinel: grows the windowed grid as it approaches the viewport. */}
        {renderCount < visible.length && (
          <div ref={gridSentinelRef} className="py-6 text-center font-mono text-[10px] text-muted-foreground" data-testid="grid-sentinel">
            // loading {visible.length - renderCount} more…
          </div>
        )}

        {visible.length === 0 && (
          <div className="text-center py-16 font-mono text-xs text-muted-foreground">
            no pokémon match those filters.
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="font-mono text-[10px] text-muted-foreground space-y-1">
            <div>// trainer's codex v5.0 · independent fan tool · not affiliated with nintendo / game freak / the pokémon company</div>
            <div>// sprite art and base data: <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer" className="hover:text-primary">pokéapi.co</a> · tcg data: <a href="https://pokemontcg.io" target="_blank" rel="noopener noreferrer" className="hover:text-primary">pokemontcg.io</a></div>
          </div>
        </footer>
      </main>

      {/* ============== STICKY TEAM BAR ============== */}
      {/* index.html sets `viewport-fit=cover`, which extends the page under the
          iOS home indicator — and nothing in the app compensated for it, so in
          standalone (installed) mode this bar sat beneath the indicator and the
          bottom row of slots was awkward to tap. The inset is 0 everywhere that
          has no notch, so this is safe on every other device. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur-md bg-background/95 pb-[env(safe-area-inset-bottom)]" style={{ borderColor: 'hsl(var(--border))' }}>
        <LiveCoverageStrip team={team} />
        {formatActive && !teamLegal.legal && (
          <div data-testid="legality-banner"
               className="max-w-6xl mx-auto px-3 py-1.5 font-mono text-[10px] flex items-center gap-2 flex-wrap"
               style={{ color: 'hsl(var(--destructive))' }}>
            <span className="uppercase tracking-widest font-bold">⚠ illegal in {ruleset.label}:</span>
            {teamLegal.offenders.map(o => (
              <span key={o.index} className="opacity-90">
                {o.p.display} <span className="opacity-60">({o.reasons.join(' · ')})</span>
              </span>
            ))}
          </div>
        )}
        <div className="max-w-6xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <div className="flex gap-1.5 flex-1 overflow-x-auto scroll-x">
            {team.map((p, i) => (
              <TeamSlot key={i} p={p} member={members[i]} idx={i}
                        onRemove={() => removeFromTeam(i)}
                        onOpen={() => setSheet(true)}
                        onConfigure={() => onConfigureSlot(i)} />
            ))}
          </div>
          <Button onClick={() => setSheet(true)} disabled={teamCount === 0} className="shrink-0 font-mono text-xs font-bold">
            <BarChart3 size={12} className="mr-1.5" />
            <span className="sr-only sm:not-sr-only">analyze</span>
            <span className="ml-1">{teamCount}/6</span>
          </Button>
        </div>
      </div>

      {/* ============== MODALS ============== */}
      <PokemonDetailDialog
        pokemon={selected} open={!!selected}
        onClose={() => setSelected(null)}
        onAdd={() => { if (selected) { addToTeam(selected); setSelected(null); } }}
        onViewTCG={() => { if (selected) { setTcgPokemon(selected); setSelected(null); } }}
        inTeam={selected ? teamIds.has(selected.id) : false}
        teamFull={teamFull}
      />
      <AnalysisSheet
        open={sheetOpen} onClose={() => setSheet(false)}
        team={team} members={members} teamName={teamName} setTeamName={setTeamName}
        defRows={defRows} offRows={offRows} statAgg={statAgg}
        threats={threats} uncovered={uncovered} suggestions={suggestions}
        counters={counters}
        onAddSuggestion={addToTeam}
        onRemove={removeFromTeam}
        onClear={clearTeam}
        onShare={() => { setSheet(false); setShare(true); }}
        onSaveToLibrary={(name) => saveCurrentToLibrary(name)}
        onBuildCounter={loadCounterTeam}
        onSelectMon={setSelected}
        onViewTCG={(p) => setTcgPokemon(p)}
        onPoster={() => { setSheet(false); setPosterOpen(true); }}
      />
      <TypeChartDialog open={chartOpen} onClose={() => setChart(false)} />
      <ShareDialog open={shareOpen} onClose={() => setShare(false)}
                   team={team} members={members} teamName={teamName}
                   trainer={trainer} premium={premium}
                   onOpenPosterStudio={() => { setShare(false); setPosterOpen(true); }} />
      <PosterStudioDialog
        open={posterOpen} onClose={() => setPosterOpen(false)}
        team={team} members={members} teamName={teamName}
        trainer={trainer} premium={premium}
        onTogglePremium={() => setPremium(p => !p)}
      />
      <MerchStudioDialog
        open={merchOpen} onClose={() => setMerchOpen(false)}
        team={members} trainer={trainer} teamName={teamName}
        code={buildShareCode(members)}
        premium={premium}
        onTogglePremium={() => setPremium(p => !p)}
      />
      <AIStudioDialog
        open={aiOpen} onClose={() => setAiOpen(false)}
        trainer={trainer} team={members}
        premium={premium}
        onTogglePremium={() => setPremium(p => !p)}
      />
      <ShowdownImportDialog
        open={importOpen} onClose={() => setImportOpen(false)}
        members={members}
        onImport={importShowdownTeam}
      />
      <SignInDialog
        open={signInOpen} onClose={() => setSignInOpen(false)}
        session={session}
        onSync={handleManualSync}
        syncing={syncing}
        lastSyncAt={lastSyncAt}
      />
      <PublishProfileDialog
        open={publishOpen} onClose={() => setPublishOpen(false)}
        client={profileClient}
        userId={session?.userId ?? null}
        onRequestSignIn={() => { setPublishOpen(false); setSignInOpen(true); }}
        trainer={trainer}
        teamName={teamName}
        members={members}
      />
      <LibraryDialog
        open={libraryOpen} onClose={() => setLibrary(false)}
        savedTeams={savedTeams} details={POKEMON_BY_ID}
        currentTeam={team} currentName={teamName}
        onLoad={loadFromLibrary}
        onDelete={deleteFromLibrary}
        onRename={renameInLibrary}
        onSaveCurrent={saveCurrentToLibrary}
        onImport={(parsed) => {
          setSavedTeams(s => [...parsed, ...s]);
          toast.success(`imported ${parsed.length} team${parsed.length === 1 ? '' : 's'}`);
        }}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelp(false)} />
      <TeamMemberConfigDialog
        open={configSlot !== null}
        onClose={() => setConfigSlot(null)}
        pokemon={configSlot !== null && members[configSlot] ? POKEMON_BY_ID[members[configSlot]!.id] : null}
        member={configSlot !== null ? members[configSlot] : null}
        onSave={(next) => {
          if (configSlot !== null) updateMember(configSlot, next);
        }}
        onOpenTCG={(p) => { setConfigSlot(null); setTcgPokemon(p); }}
        premium={premium}
      />
      <TrainerProfileDialog
        open={trainerOpen} onClose={() => setTrainerOpen(false)}
        trainer={trainer}
        onSave={(next) => { setTrainer(next); toast.success(`profile saved · ${next.name}`); }}
      />
      <TCGCardsDialog
        open={!!tcgPokemon} onClose={() => setTcgPokemon(null)}
        pokemon={tcgPokemon}
      />
      {isEnabled('JOURNEY_MODE') && (
        <JourneyModeDialog
          open={journeyOpen}
          onClose={() => setJourneyOpen(false)}
          link={JOURNEY_LINK}
          onBuilderHandoff={handleJourneyHandoff}
          onMerch={(run) => { void handleJourneyMerch(run); }}
          premium={premium}
          premiumResolved={hasLoadedStorage}
          onTogglePremium={() => setPremium(p => !p)}
        />
      )}
    </div>
  );
}

function QuickStart({ onClick, icon, label, sub, primary }: {
  onClick: () => void; icon: React.ReactNode; label: string; sub: string; primary?: boolean;
}) {
  return (
    <button onClick={onClick}
            className={cn(
              'text-left rounded-md border p-3 transition group hover:border-primary',
              primary ? 'border-primary bg-primary/8' : 'border-border bg-card'
            )}>
      <div className={cn('flex items-center gap-2 mb-1', primary ? 'text-primary' : 'text-foreground')}>
        {icon}
        <span className="font-mono text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground">// {sub}</div>
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5 text-muted-foreground">// {label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}
