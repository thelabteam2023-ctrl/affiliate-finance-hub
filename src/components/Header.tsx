import { Link } from "react-router-dom";
import { Users, Wallet, Building2, Link2, Menu, Landmark } from "lucide-react";
import favicon from "@/assets/favicon.png";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

const Header = () => {
  const navItems = [
    { to: "/parceiros", label: "Parceiros", icon: Users },
    { to: "/bancos", label: "Bancos", icon: Landmark },
    { to: "/caixa", label: "Caixa", icon: Wallet },
    { to: "/bookmakers", label: "Casas", icon: Building2 },
    { to: "/vinculos", label: "Vínculos", icon: Link2 },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3">
          <img src={favicon} alt="Labbet One" className="h-9 w-9" />
          <span className="text-lg font-bold tracking-tight">Labbet One</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to}>
              <Button variant="ghost" className="gap-2">
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>

        {/* Mobile Menu */}
        <Sheet>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <nav className="flex flex-col gap-3 pt-8">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to}>
                  <Button variant="ghost" className="w-full justify-start gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default Header;
