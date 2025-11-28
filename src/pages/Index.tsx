import { ArrowRight, TrendingUp, Users, Wallet, BarChart3, Shield, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Gradient Glow Effect */}
        <div className="absolute inset-0 bg-gradient-glow opacity-50 animate-glow-pulse" />
        
        <div className="container relative mx-auto px-4 py-20 sm:py-32">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-2 backdrop-blur-sm">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Plataforma ERP para Apostas Esportivas
              </span>
            </div>

            {/* Heading */}
            <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
              Gestão Profissional de{" "}
              <span className="text-gradient">Parcerias & Apostas</span>
            </h1>

            <p className="mb-10 text-lg text-muted-foreground sm:text-xl">
              Controle total sobre parceiros, fluxo de caixa multi-moeda e análise de ROI.
              <br className="hidden sm:block" />
              Sistema completo para escritórios de apostas esportivas.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="group h-12 gap-2 px-8 shadow-glow"
                onClick={() => navigate("/parceiros")}
              >
                Acessar Sistema
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8">
                Ver Demonstração
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Tudo que você precisa em um só lugar
          </h2>
          <p className="text-lg text-muted-foreground">
            Ferramentas profissionais para escalar suas operações
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Users className="h-6 w-6" />}
            title="Gestão de Parceiros"
            description="Cadastro completo de afiliados com CPF, contas bancárias, wallets e contratos personalizados."
          />
          <FeatureCard
            icon={<Wallet className="h-6 w-6" />}
            title="Caixa Operacional"
            description="Controle de aportes, transferências, depósitos e saques com suporte a múltiplas moedas (BRL, USD, EUR, crypto)."
          />
          <FeatureCard
            icon={<BarChart3 className="h-6 w-6" />}
            title="Análise de ROI"
            description="Dashboards detalhados com yield, lucro/prejuízo por estratégia, parceiro e casa de apostas."
          />
          <FeatureCard
            icon={<Shield className="h-6 w-6" />}
            title="Segurança Avançada"
            description="Criptografia de dados sensíveis, autenticação multi-fator e controle de acesso por hierarquia."
          />
          <FeatureCard
            icon={<TrendingUp className="h-6 w-6" />}
            title="Estratégias de Apostas"
            description="Registro de arbitragem, surebet e cálculo automático de proteção com métricas em tempo real."
          />
          <FeatureCard
            icon={<Zap className="h-6 w-6" />}
            title="Multi-tenant SaaS"
            description="Gestão de múltiplos escritórios com planos flexíveis e hierarquia de usuários configurável."
          />
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border bg-card/30 py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 sm:grid-cols-3">
            <StatCard number="100+" label="Bookmakers Suportadas" />
            <StatCard number="5+" label="Moedas Integradas" />
            <StatCard number="99.9%" label="Uptime Garantido" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="relative overflow-hidden border-border bg-gradient-surface p-12 shadow-strong">
          <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-glow opacity-30" />
          
          <div className="relative z-10 mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
              Pronto para otimizar suas operações?
            </h2>
            <p className="mb-8 text-lg text-muted-foreground">
              Comece gratuitamente e escale conforme seu escritório cresce.
            </p>
            <Button size="lg" className="h-12 gap-2 px-8 shadow-glow">
              Criar Conta Grátis
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 BetFlow ERP. Sistema profissional para gestão de apostas esportivas.</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <Card className="group relative overflow-hidden border-border bg-gradient-surface p-6 shadow-soft transition-all hover:shadow-medium hover:border-primary/50">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
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

export default Index;
