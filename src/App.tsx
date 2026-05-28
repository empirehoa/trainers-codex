import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, BarChart3, ArrowUpDown,
  Share2, Grid3x3, Filter as FilterIcon,
  RotateCcw, FolderOpen, HelpCircle, Dices,
  User, Wand2, ShoppingBag, LogIn, Cloud,
  Sun, Moon
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

import type { Pokemon, SavedTeam, PokemonType, Role, Stats, TeamMember, TrainerProfile } from '@/lib/types';
import {
  POKEMON_BY_ID, POKEMON_LIST, POKEMON_TOTAL,
  getGen
} from '@/lib/pokemon';
import {
  TYPES, GENERATIONS, ROLES, STARTER_TEAMS, THEMED_TEAMS
} from '@/lib/constants';
import {
  computeDefensive, computeOffensive, computeStats,
  computeThreats, computeUncovered, suggestFillers,
  suggestCounterTeam, generateRandomTeam,
  buildShareCode, parseShareCode
} from '@/lib/analysis';
import { loadStorage, saveStorage, genId } from '@/lib/storage';
import {
  getStoredLicense, bootstrapFromCheckoutReturn, isWorkerConfigured,
} from '@/lib/license';

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
import { SignInDialog } from '@/components/codex/SignInDialog';
import { LiveCoverageStrip } from '@/components/codex/LiveCoverageStrip';
import { auth, type AuthSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

type CategoryFilter =
  | 'all' | 'normal' | 'legendary' | 'mythical' | 'special'
  | 'base-only' | 'mega' | 'gigantamax' | 'regional' | 'paradox';

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
    try { localStorage.setItem('trainerscodex.theme', theme); } catch {}
  }, [theme]);
  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  const [pendingTeam, setPendingTeam] = useState<(TeamMember | null)[] | null>(null);
  const [search, setSearch] = useState('');
  const [filterTypes, setFType] = useState<PokemonType[]>([]);
  const [filterGens, setFGens] = useState<number[]>([]);
  const [filterRoles, setFRoles] = useState<Role[]>([]);
  const [filterCategory, setFCategory] = useState<CategoryFilter>('all');
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
  const [signInOpen, setSignInOpen] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [showFilters, setSF] = useState(false);
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [undoStack, setUndoStack] = useState<(TeamMember | null)[][]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ---------- Derived team (Pokémon objects) ----------
  const team = useMemo(() => membersToTeam(members), [members]);
  const teamCount = team.filter(Boolean).length;
  const teamFull = team.every(Boolean);
  const teamIds = useMemo(() => new Set(team.filter(Boolean).map(p => p!.id)), [team]);

  // ---------- Parse URL hash on mount ----------
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const m = hash.match(/(?:^#|&)t=([0-9a-z,\-]+)/);
      if (m) {
        const parsed = parseShareCode(m[1]);
        if (parsed) setPendingTeam(parsed);
      }
    } catch {}
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
      const code = buildShareCode(members);
      const hasAny = members.some(Boolean);
      const newHash = hasAny ? `#t=${code}` : '';
      if (window.location.hash !== newHash) {
        history.replaceState(null, '', window.location.pathname + window.location.search + newHash);
      }
    } catch {}
  }, [members]);

  // ---------- Load saved teams + restore current from localStorage on mount ----------
  useEffect(() => {
    const stored = loadStorage();
    setSavedTeams(stored.teams);
    if (stored.trainer) setTrainer(stored.trainer);

    // Premium gating: a signed Stripe license JWT takes precedence over the
    // legacy localStorage `premium` flag (which was the dev-only preview
    // toggle). The license check is structural-only here — server-side
    // verification happens lazily when premium UI opens.
    const license = getStoredLicense();
    if (license) {
      setPremium(true);
    } else if (stored.premium && !isWorkerConfigured()) {
      // Self-host / no-worker deploy: the preview toggle remains the source
      // of truth. This keeps the bundle's offline UX intact for static hosts.
      setPremium(true);
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

    // Stripe Checkout return path — if we landed here with ?session_id=...,
    // exchange it for a JWT and flip premium on. Fires asynchronously; the
    // toast acknowledges the flow without blocking initial render.
    void (async () => {
      const claims = await bootstrapFromCheckoutReturn();
      if (claims) {
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
    });
  }, [members, teamName, savedTeams, trainer, premium, hasLoadedStorage]);

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
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
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
  }, [search, filterTypes, filterGens, filterRoles, filterCategory, sortBy, sortDir]);

  // ---------- Undo helper ----------
  const pushUndo = useCallback((prev: (TeamMember | null)[]) => {
    setUndoStack(s => [...s.slice(-7), prev]);
  }, []);

  // ---------- Team actions ----------
  const addToTeam = useCallback((p: Pokemon) => {
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
  }, [pushUndo]);

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

  const loadRandom = useCallback(() => {
    pushUndo(members);
    const picks = generateRandomTeam(POKEMON_BY_ID);
    if (picks.length > 0) {
      const padded: (TeamMember | null)[] = picks.map(p => ({ id: p.id, shiny: false }));
      while (padded.length < 6) padded.push(null);
      setMembers(padded);
      setTeamName('Random Roll');
      toast('rolled a random team');
    }
  }, [members, pushUndo]);

  const loadCounterTeam = useCallback(() => {
    const counters = suggestCounterTeam(team, POKEMON_BY_ID);
    if (counters.length < 6) {
      toast.warning('not enough data to build counter — fill more slots');
      return;
    }
    pushUndo(members);
    setMembers(counters.slice(0, 6).map(c => ({ id: c.p.id, shiny: false })));
    setTeamName('Counter Team');
    toast.success('built counter team');
    setSheet(false);
  }, [team, members, pushUndo]);

  // ---------- Library actions ----------
  const saveCurrentToLibrary = useCallback((name: string) => {
    // v6: free tier capped at 3 saved teams. Premium unlimited.
    // Reason: premium-revenue lever. Anyone building 4+ teams is a power
    // user and the $4.99/mo conversion threshold is well-justified.
    if (!premium && savedTeams.length >= 3) {
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
  const suggestions = useMemo(() => suggestFillers(team, POKEMON_BY_ID, defRows, uncovered), [team, defRows, uncovered]);
  const counters = useMemo(() => suggestCounterTeam(team, POKEMON_BY_ID).slice(0, 6), [team]);

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
      <header className="border-b sticky top-0 z-30 backdrop-blur-md bg-background/92" style={{ borderColor: 'hsl(var(--border))' }}>
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
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5 hidden sm:block">
                  <User size={8} className="inline mr-0.5" /> {trainer.name}
                </p>
              ) : (
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5 hidden sm:block">v5.0 · team analyzer</p>
              )}
            </div>
          </div>
          <TooltipProvider delayDuration={150}>
            <div className="flex items-center gap-1.5 shrink-0">
              {undoStack.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={undoLast} className="w-8 h-8 hidden sm:flex">
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
                  >
                    {session ? <Cloud size={13} /> : <LogIn size={13} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{session ? `Signed in as ${session.name || session.email}` : 'Sign in for cloud sync'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setLibrary(true)}
                    className={cn('w-8 h-8', savedTeams.length > 0 && 'border-primary text-primary')}
                  >
                    <FolderOpen size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Library {savedTeams.length > 0 ? `(${savedTeams.length})` : ''}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={loadRandom} className="w-8 h-8">
                    <Dices size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Random team</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setChart(true)} className="w-8 h-8">
                    <Grid3x3 size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Type chart</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setPosterOpen(true)} disabled={teamCount === 0}
                    className={cn('w-8 h-8', teamCount > 0 && 'border-primary text-primary')}
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
                  >
                    <ShoppingBag size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Merch studio · order shirts, posters, mugs</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline" size="icon" onClick={() => setShare(true)} disabled={teamCount === 0}
                    className={cn('w-8 h-8', teamCount > 0 && 'border-primary text-primary')}
                  >
                    <Share2 size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share team</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setHelp(true)} className="w-8 h-8">
                    <HelpCircle size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Help (?)</TooltipContent>
              </Tooltip>
              <Button
                onClick={() => setSheet(true)} disabled={teamCount === 0}
                className="font-mono text-xs font-bold ml-1"
              >
                <BarChart3 size={12} className="mr-1.5" />
                <span className="hidden sm:inline">Analyze</span>
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
              <p className="text-sm text-muted-foreground mb-5 max-w-xl leading-relaxed">
                Search all {POKEMON_TOTAL} Pokémon — including legendaries, mythicals, Ultra Beasts, and Paradox forms. Pick shinies, customize movesets, check game compatibility, link to TCG cards, and generate shareable posters in 12 art styles. Order it as a T-shirt, hoodie, mug, or poster.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <QuickStart onClick={loadRandom} icon={<Dices size={14} />} label="Random" sub="diverse roll" primary />
                <QuickStart onClick={() => searchRef.current?.focus()} icon={<Search size={14} />} label="Search" sub="press /" />
                <QuickStart onClick={() => setTrainerOpen(true)} icon={<User size={14} />} label={trainer ? 'Trainer' : 'Create trainer'} sub={trainer?.name || 'optional'} />
                <QuickStart onClick={() => setHelp(true)} icon={<HelpCircle size={14} />} label="How it works" sub="quick tour" />
              </div>

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
          </section>
        )}

        {/* ============== SEARCH + FILTERS ============== */}
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search by name or # · press / to focus"
                className="pl-9 font-mono"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSF(s => !s)}
                    className={cn('font-mono text-xs', showFilters && 'border-primary text-primary')}>
              <FilterIcon size={12} className="mr-1" />
              <span className="hidden sm:inline">filters</span>
              {(filterTypes.length + filterGens.length + filterRoles.length + (filterCategory !== 'all' ? 1 : 0)) > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 py-0 text-[9px]">
                  {filterTypes.length + filterGens.length + filterRoles.length + (filterCategory !== 'all' ? 1 : 0)}
                </span>
              )}
            </Button>
            <Select value={`${sortBy}:${sortDir}`} onValueChange={(v) => {
              const [by, dir] = v.split(':');
              setSortBy(by as typeof sortBy);
              setSortDir(dir as typeof sortDir);
            }}>
              <SelectTrigger className="w-auto sm:w-[150px] font-mono text-xs h-9">
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
                ] as [CategoryFilter, string][]).map(([c, label]) => {
                  const active = filterCategory === c;
                  return (
                    <button key={c}
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
          {visible.map(p => (
            <PokemonCard key={p.id} p={p}
              onSelect={() => setSelected(p)}
              onAdd={() => addToTeam(p)}
              inTeam={teamIds.has(p.id)}
              teamFull={teamFull} />
          ))}
        </div>

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
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur-md bg-background/95" style={{ borderColor: 'hsl(var(--border))' }}>
        <LiveCoverageStrip team={team} />
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
            <span className="hidden sm:inline">analyze</span>
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
      <SignInDialog
        open={signInOpen} onClose={() => setSignInOpen(false)}
        session={session}
        onSync={handleManualSync}
        syncing={syncing}
        lastSyncAt={lastSyncAt}
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
