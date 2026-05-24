import { useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import {
  Wrench, Package, Hammer, FlaskConical, CheckCircle, Clock
} from 'lucide-react'

function RecipeCard({ recipe }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="card p-4 card-hover animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent-purple/10 text-accent-purple flex items-center justify-center">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">{recipe.name}</div>
          <div className="text-xs text-text-muted">Lv{recipe.levelReq}+ · {(recipe.successRate ?? 80)}% success</div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-accent-purple hover:underline"
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
          <div className="text-xs text-text-muted uppercase tracking-wider">Materials</div>
          {(recipe.materials ?? []).map(m => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span>{m.name}</span>
              <span className="text-text-muted">×{m.qty}</span>
            </div>
          ))}
          <div className="text-xs text-text-muted uppercase tracking-wider pt-1">Output</div>
          <div className="text-sm">{recipe.outputName} ×{recipe.outputQty}</div>
        </div>
      )}
    </div>
  )
}

export default function Crafting() {
  const { data: materials } = useApi('/panel/api/gameplay/materials')
  const { data: recipes } = useApi('/panel/api/gameplay/recipes')
  const { data: queue } = useApi('/panel/api/gameplay/crafting-queue')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Crafting</h2>
          <p className="text-sm text-text-secondary">Materials, recipes, and production queue</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-accent-cyan" />
            <h3 className="font-semibold">Materials</h3>
          </div>
          <div className="space-y-2">
            {(materials?.list ?? []).length === 0 && (
              <p className="text-sm text-text-muted">No material data.</p>
            )}
            {(materials?.list ?? []).map(m => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                <span className="text-sm">{m.name}</span>
                <span className="text-sm font-medium">{(m.stock ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Hammer className="w-4 h-4 text-accent-amber" />
            <h3 className="font-semibold">Recipes</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(recipes?.list ?? []).length === 0 && (
              <p className="text-sm text-text-muted">No recipes loaded.</p>
            )}
            {(recipes?.list ?? []).map(r => <RecipeCard key={r.id} recipe={r} />)}
          </div>
        </div>
      </div>

      <div className="card p-4 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-accent-rose" />
          <h3 className="font-semibold">Production Queue</h3>
        </div>
        <div className="space-y-2">
          {(queue?.items ?? []).length === 0 && (
            <p className="text-sm text-text-muted">Nothing in queue.</p>
          )}
          {(queue?.items ?? []).map(q => (
            <div key={q.id} className="flex items-center gap-3 border border-border-subtle rounded-lg p-3">
              <CheckCircle className={`w-5 h-5 ${q.completed ? 'text-accent-green' : 'text-text-muted'}`} />
              <div className="flex-1">
                <div className="text-sm">{q.recipeName} for {q.userTag}</div>
                <div className="text-[11px] text-text-muted">Started {new Date(q.startedAt).toLocaleString()}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-bg-elevated text-text-muted border border-border">
                {q.completed ? 'Done' : `${q.progress ?? 0}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
