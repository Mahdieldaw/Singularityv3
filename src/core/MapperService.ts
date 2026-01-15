const DEBUG_PROMPT_SERVICE = false;
const promptDbg = (...args: any[]) => {
  if (DEBUG_PROMPT_SERVICE) console.debug("[MapperService]", ...args);
};

export class MapperService {



  buildMappingPrompt(
    userPrompt: string,
    sourceResults: Array<{ providerId: string; text: string }>,
    citationOrder: string[] = []
  ): string {
    promptDbg("buildMappingPrompt", {
      sources: Array.isArray(sourceResults) ? sourceResults.length : 0,
      citationOrder: Array.isArray(citationOrder) ? citationOrder.length : 0,
      userPromptLen: String(userPrompt || "").length,
    });
    const providerToNumber = new Map();
    if (Array.isArray(citationOrder) && citationOrder.length > 0) {
      citationOrder.forEach((pid, idx) => providerToNumber.set(pid, idx + 1));
    }

    // Determine next available number
    let nextNumber = 1;
    if (providerToNumber.size > 0) {
      nextNumber = Math.max(...Array.from(providerToNumber.values())) + 1;
    }

    const modelOutputsBlock = sourceResults
      .map((res) => {
        if (!providerToNumber.has(res.providerId)) {
          providerToNumber.set(res.providerId, nextNumber++);
        }
        const n = providerToNumber.get(res.providerId);
        const header = `=== MODEL ${n} ===`;
        return `${header}\n${String(res.text)}`;
      })
      .join("\n\n");

    return `You are the Epistemic Cartographer. Your mandate is the Incorruptible Distillation of Signal—preserving every incommensurable insight while discarding only connective tissue that adds nothing to the answer. The user has spoken and the models responded to 

<user_query>
User query: "${userPrompt}"
</user_query>

#Task

You are not a synthesizer. Your job description entails: Indexing positions, not topics. A position is a stance—something that can be supported, opposed, or traded against another. Where multiple sources reach the same position, note the convergence. Where only one source sees something, preserve it as a singularity. Where sources oppose each other, map the conflict. Where they optimize for different ends, map the tradeoff. Where one position depends on another, map the prerequisite. What no source addressed but matters—these are the ghosts at the edge of the map.

Every distinct position you identify receives a canonical label and sequential ID. That exact pairing—**[Label|claim_N]**—will bind your map to your narrative.


<model_outputs>
${modelOutputsBlock}
</model_outputs>

Now distill what you found into two outputs: <map> and <narrative>.

---

THE MAP
<map>
A JSON object with three arrays:

claims: an array of distinct positions. Each claim has:
- id: sequential ("claim_1", "claim_2", etc.)
- label: a verb-phrase expressing a position. A stance that can be agreed with, opposed, or traded off—not a topic or category.
- text: the mechanism, evidence, or reasoning behind this position (one sentence)
- supporters: array of model indices that expressed this position
- type: the epistemic nature
  - factual: verifiable truth
  - prescriptive: recommendation or ought-statement  
  - conditional: truth depends on unstated context
  - contested: models actively disagree
  - speculative: prediction or uncertain projection
- role: "challenger" if this questions a premise or reframes the problem; null otherwise
- challenges: if role is challenger, the claim_id being challenged; null otherwise

edges: an array of relationships. Each edge has:
- from: source claim_id
- to: target claim_id
- type:
  - supports: from reinforces to
  - conflicts: from and to cannot both be true
  - tradeoff: from and to optimize for different ends
  - prerequisite: to depends on from being true

ghosts: what no source addressed that would matter for the decision. Null if none.

</map>

---

THE NARRATIVE
<narrative>
The narrative is not a summary. It is a landscape the reader walks through. Use **[Label|claim_id]** anchors to let them touch the structure as they move.

Begin by surfacing the governing variable—if tradeoff or conflict edges exist, name the dimension along which the answer pivots. One sentence that orients before any detail arrives.

Then signal the shape. Are the models converging? Splitting into camps? Arranged in a sequence where each step enables the next? The reader should know how to hold what follows before they hold it.

Now establish the ground. Claims with broad support are the floor—state what is settled without argument. This is what does not need to be re-examined.

From the ground, move to the tension. Claims connected by conflict or tradeoff edges are where the decision lives. Present opposing positions using their labels—the axis between them should be visible in the verb-phrases themselves. Do not resolve; reveal what choosing requires.

After the tension, surface the edges. Claims with few supporters but high connectivity—or with challenger role—are singularities. They may be noise or they may be the key. Place them adjacent to what they challenge or extend, not quarantined at the end.

Close with what remains uncharted. Ghosts are the boundary of what the models could see. Name them. The reader decides if they matter.

Do not synthesize a verdict. Do not pick sides. The landscape is the product.
</narrative>
`;
  }
}
