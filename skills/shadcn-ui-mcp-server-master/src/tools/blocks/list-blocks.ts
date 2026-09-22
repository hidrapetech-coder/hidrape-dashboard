import { getAxiosImplementation, getFramework } from "../../utils/framework.js";
import { logError } from "../../utils/logger.js";

export async function handleListBlocks({ category }: { category?: string }) {
  const framework = getFramework();

  if (framework === "react-native") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              categories: {},
              totalBlocks: 0,
              availableCategories: [],
              message:
                "Blocks are not available for React Native framework. The react-native-reusables repository does not provide block templates.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  try {
    const axios = await getAxiosImplementation();
    const blocks = await axios.getAvailableBlocks(category);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(blocks, null, 2),
        },
      ],
    };
  } catch (error) {
    logError("Failed to list blocks", error);
    throw new Error(
      `Failed to list blocks: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export const schema = {
  category: {
    type: "string",
    description:
      "Filter by category (calendar, dashboard, login, sidebar, products)",
  },
};
