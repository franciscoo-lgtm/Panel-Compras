import Image from 'next/image'
import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

type SearchParams = Promise<{ check?: string; error?: string; callbackUrl?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth()
  if (session?.user) redirect('/')

  const params = await searchParams
  const showCheckMail = params.check === 'mail'
  const hasError = params.error !== undefined
  const callbackUrl = params.callbackUrl ?? '/'

  return (
    <div className="min-h-screen brand-halo flex items-center justify-center px-6">
      <div className="w-full max-w-md fade-rise">

        {/* Logo + brand */}
        <div className="flex items-center gap-3 mb-12 justify-center">
          <div className="w-10 h-10 rounded-lg overflow-hidden ring-1 ring-white/[0.08] shadow-[0_0_24px_rgba(49,175,79,0.4)]">
            <Image src="/brand/bidcom-icon.png" alt="Bidcom Agro" width={40} height={40} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-white text-[14px] font-semibold leading-tight">Bidcom Agro</p>
            <p className="text-[#31AF4F]/70 text-[10px] tracking-widest uppercase font-medium mt-0.5">Panel de Compras</p>
          </div>
        </div>

        <div className="glass-card p-8">
          <span className="eyebrow">Acceso restringido</span>
          <h1 className="display-md text-white mt-3 mb-2">Iniciar sesión.</h1>
          <p className="text-[13px] text-white/45 mb-7 leading-relaxed">
            Ingresá con tu mail corporativo <strong className="text-white/70 font-normal">@bidcom.com.ar</strong>.
            Te enviamos un link para entrar sin contraseña.
          </p>

          {showCheckMail ? (
            <CheckYourMail />
          ) : (
            <>
              {hasError && (
                <div className="mb-5 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-[12px] text-red-300">
                  No pudimos enviar el link. Verificá que tu mail termine en <code className="font-mono text-red-200">@bidcom.com.ar</code> y volvé a intentar.
                </div>
              )}

              <form
                action={async (formData) => {
                  'use server'
                  const email = (formData.get('email') as string)?.trim().toLowerCase() ?? ''
                  if (!email.endsWith('@bidcom.com.ar')) {
                    redirect('/login?error=invalid')
                  }
                  await signIn('resend', { email, redirectTo: callbackUrl })
                }}
                className="space-y-3"
              >
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="nombre@bidcom.com.ar"
                  className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#31AF4F]/50 focus:bg-white/[0.05] transition-colors"
                />
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg text-[13px] font-semibold bg-[#31AF4F] text-white hover:bg-[#44DA68] transition-colors shadow-[0_0_24px_rgba(49,175,79,0.35)]"
                >
                  Enviarme el link de acceso
                </button>
              </form>

              <p className="mt-6 text-[11px] text-white/30 leading-relaxed">
                Solo emails del dominio <strong className="text-white/50">@bidcom.com.ar</strong> pueden acceder al panel. Si trabajás con un externo y necesita acceso temporal, contactá a quien administra el sistema.
              </p>
            </>
          )}
        </div>

        <p className="text-center mt-6 text-[10px] text-white/25 tracking-widest uppercase">
          Bidcom Agro · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}

function CheckYourMail() {
  return (
    <div className="text-center py-2">
      <div className="w-12 h-12 rounded-full bg-[#31AF4F]/15 flex items-center justify-center mx-auto mb-5 ring-1 ring-[#31AF4F]/30">
        <svg className="w-6 h-6 text-[#31AF4F]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-white text-[15px] font-semibold mb-2">Revisá tu mail.</p>
      <p className="text-[12px] text-white/50 leading-relaxed">
        Te enviamos un link de acceso. Abrí el mail desde el mismo navegador donde pediste el login.
      </p>
      <p className="mt-6 text-[10px] text-white/30">
        ¿No te llegó? Revisá spam, o <a href="/login" className="text-[#31AF4F]/80 hover:text-[#31AF4F] underline decoration-[#31AF4F]/40">probá de nuevo</a>.
      </p>
    </div>
  )
}
