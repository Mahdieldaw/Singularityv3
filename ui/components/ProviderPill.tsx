import { getProviderById } from "../providers/providerRegistry";

export const ProviderPill = ({ id }: { id: string }) => {
  const prov = getProviderById(id);
  const name = prov?.name || id || "Unknown";

  return (
    <span
      className="ml-auto self-end mt-2 text-xs
                 bg-overlay-backdrop/80 px-1.5 py-0.5
                 rounded text-text-secondary font-medium leading-[1.2]
                 flex items-center gap-1"
    >
      {prov?.logoSrc ? (
        <img
          src={prov.logoSrc}
          alt={name}
          className="w-3 h-3 rounded object-contain"
        />
      ) : (
        <span className="text-xs">{(prov as any)?.emoji || "🤖"}</span>
      )}
      {name}
    </span>
  );
};
