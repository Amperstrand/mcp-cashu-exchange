import type {
  ProviderId,
  SearchQuery,
  ServiceCategory,
  ServiceProvider,
  ServiceRecord,
} from "@exchange/contracts";

export interface ProviderSummary {
  readonly id: ProviderId;
  readonly category: ServiceCategory;
  readonly displayName: string;
}

export interface Registry {
  listProviders(): readonly ProviderSummary[];
  search(query: SearchQuery): Promise<readonly ServiceRecord[]>;
}

/** Aggregates service providers; one search fans out to matching categories. */
export function createRegistry(
  providers: readonly ServiceProvider[],
): Registry {
  return {
    listProviders: () =>
      providers.map((p) => ({
        id: p.id,
        category: p.category,
        displayName: p.displayName,
      })),
    search: async (query) => {
      const matching = providers.filter((p) => p.category === query.category);
      const results = await Promise.all(
        matching.map((provider) => provider.search(query)),
      );
      return results.flat();
    },
  };
}
