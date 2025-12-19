import { ArrowRight, Users, FolderKanban, Wallet, Shield, BarChart3, Building2, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePublicPlans } from "@/hooks/usePublicPlans";
import { Skeleton } from "@/components/ui/skeleton";

const Index = () => {
  const navigate = useNavigate();
  const { plans, loading, getMonthlyPrice } = usePublicPlans();

  // Map plan codes to display data
  const getPlanDisplayData = (planCode: string) => {
    const plan = plans.find(p => p.code === planCode);
    if (!plan) return null;
    
    const price = getMonthlyPrice(planCode);
    const priceDisplay = price === 0 ? 'R$ 0' : price ? `R$ ${price}` : 'R$ 0';
    
    return {
      ...plan,
      priceDisplay,
      period: '/mês',
    };
  };
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Gradient Glow Effect */}
        <div className="absolute inset-0 bg-gradient-glow opacity-50 animate-glow-pulse" />
        
        <div className="container relative mx-auto px-4 py-20 sm:py-32">
          <div className="mx-auto max-w-4xl text-center">
            {/* Heading */}
            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Controle profissional para quem{" "}
              <span className="text-gradient">leva apostas a sério</span>
            </h1>

            <p className="mb-10 text-lg text-muted-foreground sm:text-xl max-w-3xl mx-auto">
              Organize parceiros, projetos, operadores, apostas e financeiro em um único sistema.
              <br className="hidden sm:block" />
              Sem planilhas, sem improviso, com controle real e visão clara do resultado.
            </p>

            {/* CTA único */}
            <Button
              size="lg"
              className="group h-14 gap-2 px-10 text-base shadow-glow"
              onClick={() => navigate("/auth")}
            >
              Criar conta gratuita
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Um sistema pensado para operações reais
          </h2>
          <p className="text-lg text-muted-foreground">
            Cada funcionalidade resolve um problema concreto do dia a dia
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Users className="h-6 w-6" />}
            title="Gestão real de parceiros e contas"
            description="Centralize parceiros, casas vinculadas, saldos e movimentações, com histórico completo e visão clara de cada relação operacional."
            color="emerald"
          />
          <FeatureCard
            icon={<FolderKanban className="h-6 w-6" />}
            title="Projetos, estratégias e execução organizada"
            description="Separe operações por projeto, vincule operadores e casas, acompanhe apostas, ciclos e desempenho de forma estruturada."
            color="blue"
          />
          <FeatureCard
            icon={<Wallet className="h-6 w-6" />}
            title="Controle total do capital em uso"
            description="Visualize entradas, saídas, transferências, caixas, bancos, wallets e saldos em bookmakers, tudo em tempo real e multi-moeda."
            color="violet"
          />
          <FeatureCard
            icon={<Shield className="h-6 w-6" />}
            title="Delegue sem perder controle"
            description="Defina exatamente quem pode ver e executar cada ação, com permissões customizadas e auditoria de operações sensíveis."
            color="amber"
          />
          <FeatureCard
            icon={<BarChart3 className="h-6 w-6" />}
            title="Indicadores que mostram a verdade"
            description="Acompanhe lucro, exposição, custos, desempenho por projeto e eficiência operacional com dados confiáveis."
            color="rose"
          />
          <FeatureCard
            icon={<Building2 className="h-6 w-6" />}
            title="Sistema no lugar do improviso"
            description="Substitua planilhas e controles paralelos por uma estrutura pensada para crescer com segurança."
            color="slate"
          />
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Planos que acompanham sua evolução
          </h2>
          <p className="text-lg text-muted-foreground">
            Da organização inicial à estrutura profissional completa
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            // Loading skeleton
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-8 w-24 mb-4" />
                <Skeleton className="h-4 w-32 mb-4" />
                <Skeleton className="h-10 w-20 mb-6" />
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-full" />
                  ))}
                </div>
              </Card>
            ))
          ) : (
            <>
              <PricingCard
                name={getPlanDisplayData('free')?.name || 'Free'}
                price={getPlanDisplayData('free')?.priceDisplay || 'R$ 0'}
                period="/mês"
                description={getPlanDisplayData('free')?.description || 'Para começar com controle'}
                maxPartners={`Até ${getPlanDisplayData('free')?.entitlements?.max_partners || 3} parceiros ativos`}
                features={[
                  { text: `${getPlanDisplayData('free')?.entitlements?.max_users || 1} usuário`, included: true },
                  { text: "Organização básica da operação", included: true },
                  { text: "Registro simples de apostas", included: true },
                  { text: "Ideal para sair das planilhas", included: true },
                  { text: "Dashboard completo", included: false },
                  { text: "Operação por projetos", included: false },
                ]}
                highlighted={false}
                ctaText="Criar conta gratuita"
              />
              <PricingCard
                name={getPlanDisplayData('starter')?.name || 'Starter'}
                price={getPlanDisplayData('starter')?.priceDisplay || 'R$ 89'}
                period="/mês"
                description={getPlanDisplayData('starter')?.description || 'Para quem já opera'}
                maxPartners={`Até ${getPlanDisplayData('starter')?.entitlements?.max_partners || 6} parceiros ativos`}
                features={[
                  { text: `${getPlanDisplayData('starter')?.entitlements?.max_users || 1} usuário`, included: true },
                  { text: "Dashboards completos", included: true },
                  { text: "Controle financeiro estruturado", included: true },
                  { text: "Organização por projetos simples", included: true },
                  { text: "Suporte via WhatsApp/Discord", included: true },
                  { text: "Acesso à comunidade Labbet One", included: true },
                ]}
                highlighted={false}
                ctaText="Começar agora"
              />
              <PricingCard
                name={getPlanDisplayData('pro')?.name || 'Pro'}
                price={getPlanDisplayData('pro')?.priceDisplay || 'R$ 197'}
                period="/mês"
                description={getPlanDisplayData('pro')?.description || 'Para operações sérias'}
                maxPartners={`Até ${getPlanDisplayData('pro')?.entitlements?.max_partners || 20} parceiros ativos`}
                features={[
                  { text: `${getPlanDisplayData('pro')?.entitlements?.max_users || 2} usuários`, included: true },
                  { text: `Permissões customizadas (até ${getPlanDisplayData('pro')?.entitlements?.max_custom_permissions || 5})`, included: true },
                  { text: "Operação completa por projetos", included: true },
                  { text: "KPIs e visão real de desempenho", included: true },
                  { text: "Estratégias de entrada avançadas", included: true },
                  { text: "Ideal para apostadores profissionais", included: true },
                ]}
                highlighted={true}
                ctaText="Escalar minha operação"
              />
              <PricingCard
                name={getPlanDisplayData('advanced')?.name || 'Advanced'}
                price={getPlanDisplayData('advanced')?.priceDisplay || 'R$ 697'}
                period="/mês"
                description={getPlanDisplayData('advanced')?.description || 'Liberdade total'}
                maxPartners="Parceiros ilimitados"
                features={[
                  { text: `Até ${getPlanDisplayData('advanced')?.entitlements?.max_users || 10} usuários`, included: true },
                  { text: "Permissões customizadas ilimitadas", included: true },
                  { text: "Personalização avançada", included: true },
                  { text: "Atendimento personalizado", included: true },
                  { text: "Chamadas de alinhamento", included: true },
                ]}
                highlighted={false}
                ctaText="Ir além do Pro"
              />
            </>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Valores válidos para pagamento no cartão de crédito à vista
        </p>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border bg-card/30 py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 sm:grid-cols-3">
            <StatCard number="10+" label="Operações profissionais ativas" />
            <StatCard number="500+" label="Parceiros gerenciados" />
            <StatCard number="R$ 2M+" label="Em capital controlado" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="relative overflow-hidden border-border bg-gradient-surface p-12 shadow-strong">
          <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-glow opacity-30" />
          
          <div className="relative z-10 mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
              Pronto para organizar sua operação?
            </h2>
            <p className="mb-8 text-lg text-muted-foreground">
              Comece gratuitamente. Escale quando fizer sentido.
            </p>
            <Button 
              size="lg" 
              className="h-12 gap-2 px-8 shadow-glow"
              onClick={() => navigate("/auth")}
            >
              Criar conta gratuita
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 Labbet One. Controle profissional para operações de apostas.</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";
}) => {
  const colorClasses = {
    emerald: "bg-emerald-500/10 text-emerald-500",
    blue: "bg-blue-500/10 text-blue-500",
    violet: "bg-violet-500/10 text-violet-500",
    amber: "bg-amber-500/10 text-amber-500",
    rose: "bg-rose-500/10 text-rose-500",
    slate: "bg-slate-500/10 text-slate-400",
  };

  return (
    <Card className="group relative overflow-hidden border-border bg-gradient-surface p-6 shadow-soft transition-all hover:shadow-medium hover:border-primary/50">
      <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${colorClasses[color]}`}>
        {icon}
      </div>
      <h3 className="mb-2 text-xl font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </Card>
  );
};

const StatCard = ({ number, label }: { number: string; label: string }) => {
  return (
    <div className="text-center">
      <div className="mb-2 text-4xl font-bold text-gradient">{number}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
};

const PricingCard = ({
  name,
  price,
  period,
  description,
  maxPartners,
  features,
  highlighted,
  ctaText,
}: {
  name: string;
  price: string;
  period: string;
  description: string;
  maxPartners: string;
  features: { text: string; included: boolean }[];
  highlighted: boolean;
  ctaText: string;
}) => {
  const navigate = useNavigate();
  
  return (
    <Card
      className={`relative overflow-hidden border-border bg-gradient-surface p-6 shadow-soft transition-all hover:shadow-medium ${
        highlighted ? "border-primary shadow-glow" : ""
      }`}
    >
      {highlighted && (
        <div className="absolute right-4 top-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          Popular
        </div>
      )}
      <div className="mb-6">
        <h3 className="mb-2 text-2xl font-bold">{name}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
        <div className="mb-2">
          <span className="text-4xl font-bold">{price}</span>
          <span className="text-muted-foreground">{period}</span>
        </div>
        <div className="mb-6 inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          {maxPartners}
        </div>
      </div>
      <ul className="mb-6 space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            {feature.included ? (
              <Check className="h-5 w-5 shrink-0 text-primary" />
            ) : (
              <X className="h-5 w-5 shrink-0 text-muted-foreground/50" />
            )}
            <span
              className={`text-sm ${
                feature.included ? "text-foreground" : "text-muted-foreground/70"
              }`}
            >
              {feature.text}
            </span>
          </li>
        ))}
      </ul>
      <Button
        className={`w-full ${highlighted ? "shadow-glow" : ""}`}
        variant={highlighted ? "default" : "outline"}
        onClick={() => navigate("/auth")}
      >
        {ctaText}
      </Button>
    </Card>
  );
};

export default Index;
