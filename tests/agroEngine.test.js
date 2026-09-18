import { describe, it, expect } from 'vitest';
import { predictMoisture } from '../services/agroEngine/mlPredictor';
import { makeDecision } from '../services/agroEngine/decisionMaker';

describe('AgroEngine Tests', () => {

    const baseDataQuality = { score: 100, level: 'HIGH', sensorStatus: 'online' };
    const baseAnomalies = [];
    const baseRiskConfidence = { risk: { level: 'LOW', score: 0 }, confidence: { level: 'HIGH', score: 100, factors: [] } };

    describe('ML Predictor', () => {
        it('deve calcular o deficit corretamente', () => {
            const climate = { climateMultiplier: 1.0, eto: 4 };
            // Umidade 30, limite da cana-de-açúcar é 35, deficit deve ser 5
            const predictor = predictMoisture([{ data: new Date().toISOString(), umidade: 30 }], climate, 'cana-de-açúcar');
            
            expect(predictor.deficitAtual).toBe(5);
            expect(predictor.hoursUntilStress).toBe(0); // Zero clamping resolvido
        });

        it('deve usar o ET0 como fallback se não houver histórico suficiente', () => {
            const climate = { climateMultiplier: 1.0, eto: 5 }; // eto 5 * kc 1.05 / 24 = 0.218. * 1.5 fallback = 0.32
            const predictor = predictMoisture([{ data: new Date().toISOString(), umidade: 50 }], climate, 'cana-de-açúcar');
            
            expect(predictor.dynamicDropRate).toBeGreaterThan(0.3);
            expect(predictor.dynamicDropRate).toBeLessThan(0.35);
        });
    });

    describe('Decision Maker Scenarios', () => {
        it('deve recomendar IRRIGAR quando há deficit crítico e pouca chuva', () => {
            const climate = { maxRainProb12h: 80, expectedRainVolume12h: 2, eto: 3, temperature: 25 };
            const predictor = { deficitAtual: 10, hoursUntilStress: 0, criticalLimit: 40, predictions: {} };
            
            const decision = makeDecision(baseDataQuality, baseAnomalies, climate, predictor, baseRiskConfidence, 30);
            
            expect(decision.action).toBe('IRRIGAR');
            expect(decision.explanation.some(e => e.includes('volume é insuficiente'))).toBe(true);
        });

        it('deve recomendar AGUARDAR quando há deficit, MAS haverá chuva suficiente', () => {
            const climate = { maxRainProb12h: 90, expectedRainVolume12h: 15, eto: 3, temperature: 25 };
            const predictor = { deficitAtual: 10, hoursUntilStress: 0, criticalLimit: 40, predictions: {} };
            
            const decision = makeDecision(baseDataQuality, baseAnomalies, climate, predictor, baseRiskConfidence, 30);
            
            expect(decision.action).toBe('AGUARDAR');
            expect(decision.explanation.some(e => e.includes('chuva suficiente'))).toBe(true);
        });

        it('deve recomendar ATENÇÃO quando o deficit está próximo', () => {
            const climate = { maxRainProb12h: 10, expectedRainVolume12h: 0, eto: 3, temperature: 25 };
            const predictor = { deficitAtual: 0, hoursUntilStress: 4, criticalLimit: 40, predictions: { in6h: 38 } };
            
            const decision = makeDecision(baseDataQuality, baseAnomalies, climate, predictor, baseRiskConfidence, 45);
            
            expect(decision.action).toBe('ATENÇÃO');
        });

        it('deve recomendar MONITORAR quando as condições estão seguras', () => {
            const climate = { maxRainProb12h: 10, expectedRainVolume12h: 0, eto: 3, temperature: 25 };
            const predictor = { deficitAtual: 0, hoursUntilStress: 20, criticalLimit: 40, predictions: { in12h: 45 } };
            
            const decision = makeDecision(baseDataQuality, baseAnomalies, climate, predictor, baseRiskConfidence, 60);
            
            expect(decision.action).toBe('MONITORAR');
        });
        
        it('deve recomendar VERIFICAR_SENSOR se a confiança for LOW', () => {
            const lowConfidence = { risk: { level: 'LOW', score: 0 }, confidence: { level: 'LOW', score: 20, factors: ['Sensor offline'] } };
            const climate = { maxRainProb12h: 10, expectedRainVolume12h: 0, eto: 3, temperature: 25 };
            const predictor = { deficitAtual: 10, hoursUntilStress: 0, criticalLimit: 40, predictions: {} }; // Mesmo com deficit crítico!
            
            const decision = makeDecision(baseDataQuality, baseAnomalies, climate, predictor, lowConfidence, 30);
            
            expect(decision.action).toBe('VERIFICAR_SENSOR');
        });
    });
});
