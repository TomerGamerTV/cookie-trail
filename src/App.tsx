import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Cookie,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Unplug,
  Wallet,
  Wifi,
  XCircle,
} from 'lucide-react'
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { Buffer } from 'buffer'
import './App.css'

const RPC_URL = 'https://rpc.cookiescan.io'
const WS_URL = 'https://wss.cookiescan.io'
const EXPLORER_URL = 'https://cookiescan.io'
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

type WalletAccount = {
  address: string
  publicKey: Uint8Array
  chains?: readonly string[]
  features?: readonly string[]
}

type NightlySolana = {
  genesisHash?: string
  changeNetwork?: (network: { genesisHash: string; url?: string }) => Promise<unknown>
  features: {
    'standard:connect'?: {
      connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>
    }
    'standard:disconnect'?: { disconnect: () => Promise<void> }
    'solana:signTransaction'?: {
      signTransaction: (input: {
        account: WalletAccount
        transaction: Uint8Array
      }) => Promise<readonly { signedTransaction: Uint8Array }[]>
    }
  }
}

declare global {
  interface Window {
    nightly?: { solana?: NightlySolana }
  }
}

type Receipt = {
  signature: string
  recipient: string
  amount: number
  note: string
  timestamp: number
  status: 'confirmed' | 'failed'
}

type NetworkStats = {
  slot: number
  blockHeight: number
  tps: number
  genesisHash: string
}

type TxState =
  | { phase: 'idle'; message: string }
  | { phase: 'signing'; message: string }
  | { phase: 'sending'; message: string }
  | { phase: 'confirming'; message: string }
  | { phase: 'success'; message: string; signature: string }
  | { phase: 'error'; message: string }

const connection = new Connection(RPC_URL, { commitment: 'confirmed', wsEndpoint: WS_URL })

const short = (value: string, head = 5, tail = 5) =>
  value.length > head + tail + 3 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value

const formatCook = (lamports: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 5 }).format(lamports / LAMPORTS_PER_SOL)

const explorerTx = (signature: string) => `${EXPLORER_URL}/tx/${signature}`
const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`

function App() {
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [networkBusy, setNetworkBusy] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('0.001')
  const [note, setNote] = useState('')
  const [txState, setTxState] = useState<TxState>({ phase: 'idle', message: 'Ready to create a receipt.' })
  const [receipts, setReceipts] = useState<Receipt[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cookie-trail-receipts') ?? '[]') as Receipt[]
    } catch {
      return []
    }
  })

  const walletInstalled = typeof window !== 'undefined' && Boolean(window.nightly?.solana)

  useEffect(() => {
    localStorage.setItem('cookie-trail-receipts', JSON.stringify(receipts.slice(0, 40)))
  }, [receipts])

  const refreshNetwork = useCallback(async () => {
    setNetworkBusy(true)
    try {
      const [slot, blockHeight, performance, genesisHash] = await Promise.all([
        connection.getSlot('confirmed'),
        connection.getBlockHeight('confirmed'),
        connection.getRecentPerformanceSamples(1),
        connection.getGenesisHash(),
      ])
      const sample = performance[0]
      const tps = sample && sample.samplePeriodSecs > 0 ? Math.round(sample.numTransactions / sample.samplePeriodSecs) : 0
      setStats({ slot, blockHeight, tps, genesisHash })
    } catch (error) {
      setTxState({ phase: 'error', message: `Cookie Chain RPC unavailable: ${getErrorMessage(error)}` })
    } finally {
      setNetworkBusy(false)
    }
  }, [])

  const refreshBalance = useCallback(async (walletAccount = account) => {
    if (!walletAccount) return
    try {
      const value = await connection.getBalance(new PublicKey(walletAccount.address), 'confirmed')
      setBalance(value)
    } catch {
      setBalance(null)
    }
  }, [account])

  useEffect(() => {
    void refreshNetwork()
    const timer = window.setInterval(() => void refreshNetwork(), 15000)
    return () => window.clearInterval(timer)
  }, [refreshNetwork])

  useEffect(() => {
    if (account) void refreshBalance(account)
  }, [account, refreshBalance])

  const switchToCookieChain = async () => {
    const nightly = window.nightly?.solana
    if (!nightly) {
      window.open('https://nightly.app', '_blank', 'noopener,noreferrer')
      return
    }
    try {
      const genesisHash = stats?.genesisHash ?? (await connection.getGenesisHash())
      if (!nightly.changeNetwork) throw new Error('This Nightly version does not expose custom network switching.')
      await nightly.changeNetwork({ genesisHash, url: RPC_URL })
      setTxState({ phase: 'idle', message: 'Nightly is configured for Cookie Chain.' })
    } catch (error) {
      setTxState({ phase: 'error', message: getErrorMessage(error) })
    }
  }

  const connectWallet = async () => {
    const nightly = window.nightly?.solana
    if (!nightly) {
      window.open('https://nightly.app', '_blank', 'noopener,noreferrer')
      return
    }
    try {
      const connect = nightly.features['standard:connect']?.connect
      if (!connect) throw new Error('Nightly connect feature is unavailable.')
      const result = await connect({ silent: false })
      const connected = result.accounts[0]
      if (!connected) throw new Error('No wallet account was approved.')
      setAccount(connected)
      setRecipient(connected.address)
      setTxState({ phase: 'idle', message: 'Wallet connected. Create your first CookieTrail receipt.' })
      await refreshBalance(connected)
    } catch (error) {
      setTxState({ phase: 'error', message: getErrorMessage(error) })
    }
  }

  const disconnectWallet = async () => {
    try {
      await window.nightly?.solana?.features['standard:disconnect']?.disconnect?.()
    } catch {
      // A local disconnect should still work if this Nightly version lacks the feature.
    }
    setAccount(null)
    setBalance(null)
    setTxState({ phase: 'idle', message: 'Wallet disconnected.' })
  }

  const createReceipt = async () => {
    if (!account) {
      setTxState({ phase: 'error', message: 'Connect Nightly first.' })
      return
    }

    const signer = window.nightly?.solana?.features['solana:signTransaction']?.signTransaction
    if (!signer) {
      setTxState({ phase: 'error', message: 'Nightly transaction signing is unavailable.' })
      return
    }

    let destination: PublicKey
    try {
      destination = new PublicKey(recipient.trim())
    } catch {
      setTxState({ phase: 'error', message: 'Enter a valid Cookie Chain wallet address.' })
      return
    }

    const cook = Number(amount)
    if (!Number.isFinite(cook) || cook < 0 || cook > 1_000_000) {
      setTxState({ phase: 'error', message: 'Amount must be a valid non-negative COOK value.' })
      return
    }
    if (!note.trim()) {
      setTxState({ phase: 'error', message: 'Add a short receipt note so the transaction has useful context.' })
      return
    }
    if (note.length > 360) {
      setTxState({ phase: 'error', message: 'Keep the receipt note under 360 characters.' })
      return
    }

    try {
      setTxState({ phase: 'signing', message: 'Building receipt and waiting for your Nightly signature…' })
      const sender = new PublicKey(account.address)
      const transaction = new Transaction()
      const lamports = Math.round(cook * LAMPORTS_PER_SOL)

      if (lamports > 0) transaction.add(SystemProgram.transfer({ fromPubkey: sender, toPubkey: destination, lamports }))

      const memoPayload = {
        app: 'CookieTrail',
        v: 1,
        amount: cook.toString(),
        to: destination.toBase58(),
        note: note.trim(),
        createdAt: new Date().toISOString(),
      }

      transaction.add(new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(JSON.stringify(memoPayload), 'utf8'),
      }))

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      transaction.recentBlockhash = blockhash
      transaction.feePayer = sender

      const unsigned = transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
      const outputs = await signer({ account, transaction: unsigned })
      const signed = outputs[0]?.signedTransaction
      if (!signed) throw new Error('Nightly returned no signed transaction.')

      setTxState({ phase: 'sending', message: 'Signature received. Broadcasting to Cookie Chain…' })
      const signature = await connection.sendRawTransaction(signed, { skipPreflight: false, maxRetries: 3 })

      setTxState({ phase: 'confirming', message: 'Transaction sent. Waiting for confirmed finality…' })
      const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
      if (confirmation.value.err) throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)

      const receipt: Receipt = {
        signature,
        recipient: destination.toBase58(),
        amount: cook,
        note: note.trim(),
        timestamp: Date.now(),
        status: 'confirmed',
      }
      setReceipts((current) => [receipt, ...current].slice(0, 40))
      setTxState({ phase: 'success', message: 'Receipt confirmed on Cookie Chain.', signature })
      setNote('')
      await Promise.all([refreshBalance(account), refreshNetwork()])
    } catch (error) {
      setTxState({ phase: 'error', message: getErrorMessage(error) })
    }
  }

  const totalSent = useMemo(() => receipts.reduce((sum, item) => sum + item.amount, 0), [receipts])
  const successRate = receipts.length ? Math.round((receipts.filter((item) => item.status === 'confirmed').length / receipts.length) * 100) : 100
  const connectedOnCookie = Boolean(stats?.genesisHash && window.nightly?.solana?.genesisHash === stats.genesisHash)

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="CookieTrail home">
          <span className="brand-mark"><Cookie size={22} /></span>
          <span>CookieTrail</span>
          <span className="beta-pill">ON-CHAIN RECEIPTS</span>
        </a>
        <div className="topbar-actions">
          <span className="network-pill"><span className="live-dot" /> Cookie Chain</span>
          {account ? (
            <button className="wallet-button connected" onClick={disconnectWallet} title="Disconnect Nightly">
              <Wallet size={17} /> {short(account.address)} <Unplug size={14} />
            </button>
          ) : (
            <button className="wallet-button" onClick={connectWallet}><Wallet size={17} /> Connect Nightly</button>
          )}
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow"><Sparkles size={15} /> Proof for every payment</div>
          <h1>Send COOK.<br /><span>Leave a trail.</span></h1>
          <p className="hero-copy">CookieTrail turns a simple Cookie Chain transfer into a human-readable, tamper-evident receipt using the native Memo program.</p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={account ? () => document.querySelector('#receipt-builder')?.scrollIntoView({ behavior: 'smooth' }) : connectWallet}>
              {account ? 'Create a receipt' : 'Connect Nightly'} <ArrowUpRight size={17} />
            </button>
            <button className="secondary-cta" onClick={switchToCookieChain}><Wifi size={17} /> {walletInstalled ? 'Switch to Cookie Chain' : 'Get Nightly'}</button>
          </div>
          <div className="trust-row">
            <span><ShieldCheck size={16} /> No custody</span>
            <span><FileCheck2 size={16} /> Memo-backed</span>
            <span><Activity size={16} /> Live confirmation</span>
          </div>
        </section>

        <section className="stats-grid" aria-label="Cookie Chain network statistics">
          <Metric icon={<Wifi size={18} />} label="RPC status" value={stats ? 'Online' : 'Checking…'} accent={Boolean(stats)} />
          <Metric icon={<Activity size={18} />} label="Current slot" value={stats ? stats.slot.toLocaleString() : '—'} />
          <Metric icon={<Sparkles size={18} />} label="Observed TPS" value={stats ? stats.tps.toLocaleString() : '—'} />
          <Metric icon={<CircleDollarSign size={18} />} label="Your balance" value={balance === null ? (account ? 'Loading…' : 'Connect wallet') : `${formatCook(balance)} COOK`} />
        </section>

        <section className="workspace-grid">
          <article className="panel builder-panel" id="receipt-builder">
            <div className="panel-heading">
              <div><span className="section-kicker">CREATE</span><h2>On-chain receipt</h2></div>
              <span className={`chain-check ${connectedOnCookie ? 'ok' : ''}`}>
                {connectedOnCookie ? <CheckCircle2 size={15} /> : <Wifi size={15} />}
                {connectedOnCookie ? 'Nightly on Cookie Chain' : 'Cookie RPC ready'}
              </span>
            </div>

            <label>
              Recipient
              <div className="input-wrap">
                <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Cookie Chain address" spellCheck={false} />
                {account && <button className="input-action" onClick={() => setRecipient(account.address)}>ME</button>}
              </div>
            </label>

            <label>
              Amount
              <div className="amount-wrap">
                <input type="number" min="0" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} />
                <span>COOK</span>
              </div>
              <small>Set 0 for a memo-only proof. Network fees still apply.</small>
            </label>

            <label>
              Receipt note
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={360} placeholder="What is this payment for?" />
              <small className="counter">{note.length}/360</small>
            </label>

            <div className={`tx-status ${txState.phase}`}>
              <TxIcon phase={txState.phase} />
              <div><strong>{statusTitle(txState.phase)}</strong><span>{txState.message}</span></div>
              {'signature' in txState && <a href={explorerTx(txState.signature)} target="_blank" rel="noreferrer" aria-label="View transaction in Cookiescan"><ExternalLink size={17} /></a>}
            </div>

            <button className="send-button" onClick={createReceipt} disabled={!account || ['signing', 'sending', 'confirming'].includes(txState.phase)}>
              {['signing', 'sending', 'confirming'].includes(txState.phase) ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
              {account ? 'Sign & send receipt' : 'Connect Nightly to continue'}
            </button>
          </article>

          <aside className="panel analytics-panel">
            <div className="panel-heading compact">
              <div><span className="section-kicker">ANALYTICS</span><h2>Your trail</h2></div>
              <button className="icon-button" onClick={() => { void refreshNetwork(); void refreshBalance() }} title="Refresh data"><RefreshCw className={networkBusy ? 'spin' : ''} size={17} /></button>
            </div>
            <div className="analytics-cards">
              <div><span>Receipts</span><strong>{receipts.length}</strong></div>
              <div><span>Total sent</span><strong>{totalSent.toLocaleString(undefined, { maximumFractionDigits: 4 })} <em>COOK</em></strong></div>
              <div><span>Success</span><strong>{successRate}<em>%</em></strong></div>
              <div><span>Block height</span><strong>{stats?.blockHeight.toLocaleString() ?? '—'}</strong></div>
            </div>

            <div className="network-card">
              <div className="network-orbit"><Cookie size={30} /></div>
              <div><span>Connected network</span><strong>Cookie Chain</strong><small>{stats ? short(stats.genesisHash, 8, 8) : 'Fetching genesis hash…'}</small></div>
            </div>

            <a className="explorer-link" href={EXPLORER_URL} target="_blank" rel="noreferrer">Open Cookiescan explorer <ExternalLink size={15} /></a>
          </aside>
        </section>

        <section className="panel receipts-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">HISTORY</span><h2>Recent receipts</h2></div>
            <span className="history-note">Stored locally · verified on-chain</span>
          </div>

          {receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><FileCheck2 size={28} /></div>
              <strong>No receipts yet</strong>
              <span>Your confirmed CookieTrail receipts will appear here.</span>
            </div>
          ) : (
            <div className="receipt-list">
              {receipts.map((receipt) => (
                <div className="receipt-row" key={receipt.signature}>
                  <span className="receipt-status"><CheckCircle2 size={18} /></span>
                  <div className="receipt-main">
                    <strong>{receipt.note}</strong>
                    <span>to <a href={explorerAddress(receipt.recipient)} target="_blank" rel="noreferrer">{short(receipt.recipient)}</a>{' · '}{new Date(receipt.timestamp).toLocaleString()}</span>
                  </div>
                  <strong className="receipt-amount">{receipt.amount.toLocaleString(undefined, { maximumFractionDigits: 5 })} COOK</strong>
                  <button className="copy-button" title="Copy transaction signature" onClick={() => void navigator.clipboard.writeText(receipt.signature)}><Copy size={15} /></button>
                  <a className="row-link" href={explorerTx(receipt.signature)} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="how-it-works">
          <div><span className="step">01</span><h3>Connect Nightly</h3><p>CookieTrail detects Nightly and can request the correct Cookie Chain custom SVM network.</p></div>
          <div><span className="step">02</span><h3>Attach context</h3><p>Your transfer and receipt note are composed into one atomic transaction using the canonical Memo program.</p></div>
          <div><span className="step">03</span><h3>Verify forever</h3><p>Confirmation is tracked live and every receipt links back to its public Cookiescan transaction.</p></div>
        </section>
      </main>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark"><Cookie size={18} /></span><span>CookieTrail</span></div>
        <span>Built for Cookie Chain · non-custodial · open source</span>
        <div className="footer-links">
          <a href="https://docs.cookiechain.wtf" target="_blank" rel="noreferrer">Docs</a>
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer">Explorer</a>
          <a href="https://hyperlane.cookiescan.io" target="_blank" rel="noreferrer">Bridge</a>
        </div>
      </footer>
    </div>
  )
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className="metric-card"><span className={`metric-icon ${accent ? 'accent' : ''}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>
}

function TxIcon({ phase }: { phase: TxState['phase'] }) {
  if (phase === 'success') return <CheckCircle2 size={20} />
  if (phase === 'error') return <XCircle size={20} />
  if (['signing', 'sending', 'confirming'].includes(phase)) return <LoaderCircle className="spin" size={20} />
  return <ShieldCheck size={20} />
}

function statusTitle(phase: TxState['phase']) {
  const titles: Record<TxState['phase'], string> = {
    idle: 'Ready',
    signing: 'Signature requested',
    sending: 'Broadcasting',
    confirming: 'Confirming',
    success: 'Confirmed',
    error: 'Needs attention',
  }
  return titles[phase]
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Something went wrong. Try again.'
}

export default App
