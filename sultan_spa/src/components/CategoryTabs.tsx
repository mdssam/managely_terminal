
"use client";

import { useItemGroups } from "../hooks/useItemGroups";

interface CategoryTabsProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  isMobile?: boolean;
  starredCount?: number;
}

export default function CategoryTabs({
  selectedCategory,
  onCategoryChange,
  isMobile = false,
  starredCount = 0,
}: CategoryTabsProps) {

 const {
  itemGroups,
  isLoading: isValidating,
  error,
  total_item_count,
} = useItemGroups();


  if (isValidating) return <div>Loading categories...</div>;

  if (error) {
    console.error("❌ Error fetching item groups:", error);

    return (
      <div className="text-gray-900">
        <p>Error loading categories:</p>
        <pre className="text-xs bg-ziditech-50 p-2 rounded">{error}</pre>
      </div>
    );
  }

  if (!itemGroups || itemGroups.length === 0) {
    return <div>No item groups found.</div>;
  }

  const categories = [
    {
      id: "starred",
      name: "⭐ Starred",
      count: starredCount,
      isStarred: true,
    },
    {
      id: "all",
      name: "All Items",
      count: total_item_count,
      isStarred: false,
    },
    ...itemGroups.map((group) => ({
      id: group.id,
      name: group.name,
      count: group.count ?? 1,
      isStarred: false,
    })),
  ];

  return (
    <div className="flex space-x-2 overflow-x-auto py-2 scrollbar-hide">
      {categories.map((category) => {
        const isSelected = selectedCategory === category.id;
        const isStarredTab = category.isStarred;

        return (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={`flex items-center justify-center px-3 py-2 rounded-xl whitespace-nowrap transition-all duration-200 flex-shrink-0 min-w-fit ${
              isSelected
                ? isStarredTab
                  ? "text-yellow-900 border shadow-sm"
                  : "bg-ziditech-50 text-gray-900 border border-ziditech-400 shadow-sm"
                : isStarredTab
                  ? "bg-white text-yellow-700 hover:bg-yellow-50 border border-yellow-200"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
            style={
              isSelected && isStarredTab
                ? { backgroundColor: 'rgba(255,193,7,0.15)', borderColor: '#fbbf24' }
                : {}
            }
          >
            <div className="flex flex-col items-center">
              <span className={`font-semibold ${isMobile ? "text-xs" : "text-sm"}`}>
                {category.name}
              </span>
              <span className={`${isMobile ? "text-xs" : "text-xs"} font-medium opacity-70`}>
                {category.count} Item{category.count !== 1 ? "s" : ""}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
