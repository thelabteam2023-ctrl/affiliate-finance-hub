/**
 * SurebetCompactHeader - Cabeçalho minimalista para o formulário de Surebet
 * 
 * Exibe apenas: Mercado e Modelo em uma única linha
 * Sem cards, badges grandes ou blocos visuais
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface SurebetCompactHeaderProps {
  esporte: string;
  setEsporte: (value: string) => void;
  evento: string;
  setEvento: (value: string) => void;
  mercado: string;
  setMercado: (value: string) => void;
  modelo: "1-X-2" | "1-2";
  setModelo: (value: "1-X-2" | "1-2") => void;
  isEditing: boolean;
}

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

export function SurebetCompactHeader({
  esporte,
  setEsporte,
  evento,
  setEvento,
  mercado,
  setMercado,
  modelo,
  setModelo,
  isEditing,
}: SurebetCompactHeaderProps) {

  return (
    <div className="space-y-3">
      {/* Linha 1: Esporte + Evento */}
      <div className="flex items-center gap-3">
        <Select value={esporte} onValueChange={setEsporte}>
          <SelectTrigger className="w-[140px] h-8 text-xs border-0 bg-muted/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESPORTES.map(e => (
              <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Input
          value={evento}
          onChange={(e) => setEvento(e.target.value)}
          placeholder="TIME 1 X TIME 2"
          className="flex-1 h-8 text-xs border-0 bg-muted/40"
        />
      </div>

      {/* Linha 2: Mercado + Modelo */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-xs font-medium">Mercado:</span>
        <Input
          value={mercado}
          onChange={(e) => setMercado(e.target.value)}
          placeholder="Ex: Resultado Final"
          className="w-[200px] h-7 text-xs border-0 bg-transparent hover:bg-muted/30"
        />
        
        <span className="text-muted-foreground/50 mx-2">|</span>
        
        <span className="text-xs font-medium">Modelo:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => !isEditing && setModelo("1-2")}
            disabled={isEditing}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
              modelo === "1-2" 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1-2
          </button>
          <button
            type="button"
            onClick={() => !isEditing && setModelo("1-X-2")}
            disabled={isEditing}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
              modelo === "1-X-2" 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1-X-2
          </button>
        </div>
      </div>
    </div>
  );
}
