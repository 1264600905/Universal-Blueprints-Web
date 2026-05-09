import React, { useState, useMemo, useEffect } from 'react';
import { Filter } from 'lucide-react';
import BlueprintCard from './components/BlueprintCard';
import RemoteToolbar from './components/RemoteToolbar';
import MobileFilterSheet from './components/MobileFilterSheet';
import BlueprintDetail from './components/BlueprintDetail';
import BlueprintImageViewer from './components/BlueprintImageViewer';
import { useBlueprintData } from './hooks/useBlueprintData';
import { useBlueprintDetail } from './hooks/useBlueprintDetail';
import { BlueprintListItem, SortOption, TimeFilterOption, Language, CategoryCount, FilterCounts } from './types';
import { sortBlueprints, mapToOfficialCategoryKey, OFFICIAL_CATEGORY_ORDER, getTimeFilterCutoff } from './utils/blueprintUtils';
import { TRANSLATIONS } from './constants';

const App: React.FC = () => {
  // --- Page States ---
  const [lang, setLang] = useState<Language>('en');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [timeRange, setTimeRange] = useState<TimeFilterOption>('last7Days');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // --- UI States ---
  const [selectedBlueprint, setSelectedBlueprint] = useState<BlueprintListItem | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('zh')) setLang('cn');
    else setLang('en');
  }, []);

  const toggleLanguage = () => setLang(prev => prev === 'en' ? 'cn' : 'en');

  // --- Data Layer ---
  const { blueprints, basePath, loading, error, refresh } = useBlueprintData();
  const { detailData, loading: detailLoading, error: detailError } = useBlueprintDetail(selectedBlueprint, basePath);

  // --- Derived Data (Filters & Sorts) ---
  const categoriesList = useMemo(() => {
    const activeOfficialKeys = new Set<string>();
    const activeCustomCategories = new Set<string>();

    for (const b of blueprints) {
      const rawCategory = b.c || '';
      if (!rawCategory) continue;

      const officialKey = mapToOfficialCategoryKey(rawCategory);
      if (officialKey) {
        activeOfficialKeys.add(officialKey);
      } else {
        activeCustomCategories.add(rawCategory);
      }
    }

    const official = OFFICIAL_CATEGORY_ORDER.filter(k => activeOfficialKeys.has(k));
    const custom = Array.from(activeCustomCategories).sort((a, b) => a.localeCompare(b));
    
    return ['All', ...official, ...custom];
  }, [blueprints]);

  const filterCounts = useMemo<FilterCounts>(() => {
    // Base search filter applied first
    const searchFiltered = blueprints.filter(b => 
      !searchTerm || 
      (b.n || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (b.a || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const checkTime = (b: BlueprintListItem, tRange: TimeFilterOption) => {
      const cutoff = getTimeFilterCutoff(tRange);
      if (!cutoff) return true;
      const ms = new Date(b.dt).getTime();
      return !Number.isNaN(ms) && ms >= cutoff.getTime();
    };

    const checkCategory = (b: BlueprintListItem, cat: string) => {
      if (cat === 'All') return true;
      if (OFFICIAL_CATEGORY_ORDER.includes(cat)) return mapToOfficialCategoryKey(b.c) === cat;
      return (b.c || '') === cat;
    };

    const checkSortFilter = (b: BlueprintListItem, sort: SortOption) => {
      if (sort === 'featured') return b.fe === 1;
      if (sort === 'medal') return (b.am || 0) === 1;
      return true;
    };

    // 1. Category Counts (Apply Search, Time, Sort)
    const catBase = searchFiltered.filter(b => checkTime(b, timeRange) && checkSortFilter(b, sortBy));
    const category: Record<string, number> = { 'All': catBase.length };
    catBase.forEach(b => {
      const rawCategory = b.c || '';
      if (!rawCategory) return;
      const offKey = mapToOfficialCategoryKey(rawCategory);
      const key = offKey || rawCategory;
      category[key] = (category[key] || 0) + 1;
    });

    // 2. Time Counts (Apply Search, Category, Sort)
    const timeBase = searchFiltered.filter(b => checkCategory(b, selectedCategory) && checkSortFilter(b, sortBy));
    const timeOptions: TimeFilterOption[] = ['all', 'last7Days', 'last15Days', 'last30Days', 'last3Months', 'last6Months', 'lastYear'];
    const time: Record<TimeFilterOption, number> = {} as Record<TimeFilterOption, number>;
    timeOptions.forEach(t => {
      time[t] = timeBase.filter(b => checkTime(b, t)).length;
    });

    // 3. Sort Counts (Apply Search, Category, Time)
    const sortBase = searchFiltered.filter(b => checkCategory(b, selectedCategory) && checkTime(b, timeRange));
    const sort: Record<SortOption, number> = {
      popularity: sortBase.length,
      newest: sortBase.length,
      downloads: sortBase.length,
      likes: sortBase.length,
      featured: sortBase.filter(b => b.fe === 1).length,
      medal: sortBase.filter(b => (b.am || 0) === 1).length,
    };

    return { category, time, sort };
  }, [blueprints, searchTerm, timeRange, selectedCategory, sortBy]);

  const categories = useMemo<CategoryCount[]>(() => {
    return categoriesList.map(k => ({
      name: k,
      count: filterCounts.category[k] || 0
    }));
  }, [categoriesList, filterCounts.category]);

  const filteredAndSortedBlueprints = useMemo(() => {
    let result = blueprints;

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(b => 
        (b.n || '').toLowerCase().includes(lower) || 
        (b.a || '').toLowerCase().includes(lower)
      );
    }

    if (selectedCategory !== 'All') {
      if (OFFICIAL_CATEGORY_ORDER.includes(selectedCategory)) {
        result = result.filter(b => mapToOfficialCategoryKey(b.c) === selectedCategory);
      } else {
        result = result.filter(b => (b.c || '') === selectedCategory);
      }
    }

    const cutoff = getTimeFilterCutoff(timeRange);
    if (cutoff) {
      const cutoffMs = cutoff.getTime();
      result = result.filter(b => {
        const createdMs = new Date(b.dt).getTime();
        return !Number.isNaN(createdMs) && createdMs >= cutoffMs;
      });
    }

    if (sortBy === 'featured') {
      result = result.filter(b => b.fe === 1);
      return sortBlueprints(result, 'popularity');
    }
    if (sortBy === 'medal') {
      result = result.filter(b => (b.am || 0) === 1);
      return sortBlueprints(result, 'popularity');
    }

    return sortBlueprints(result, sortBy);

  }, [blueprints, searchTerm, selectedCategory, timeRange, sortBy]);

  return (
    <div className="min-h-screen bg-rim-dark font-sans text-rim-text flex flex-col">
      <RemoteToolbar 
        lang={lang}
        toggleLanguage={toggleLanguage}
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        sortBy={sortBy} setSortBy={setSortBy}
        timeRange={timeRange} setTimeRange={setTimeRange}
        selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
        categories={categories}
        filterCounts={filterCounts}
        loading={loading} refresh={refresh}
        onOpenMobileFilter={() => setIsMobileFilterOpen(true)}
      />

      <main className="flex-grow p-4 md:p-6 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto">
            {error && (
                <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded mb-6 text-center">
                    <p className="font-bold">{t.error}</p>
                    <p className="text-sm opacity-80">{error}</p>
                </div>
            )}

            {!loading && !error && filteredAndSortedBlueprints.length === 0 && (
                <div className="text-center py-20 text-rim-muted">
                    <Filter size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-lg">{t.empty}</p>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {filteredAndSortedBlueprints.map(bp => (
                    <BlueprintCard 
                        key={bp.id} 
                        blueprint={bp} 
                        onClick={() => setSelectedBlueprint(bp)} 
                        lang={lang}
                    />
                ))}
            </div>
        </div>
      </main>

      <footer className="bg-[#111] border-t border-rim-border py-4 text-center text-xs text-rim-muted">
        <p>{t.footer} &copy; {new Date().getFullYear()}</p>
        <p className="mt-1 opacity-50">{t.unofficial}</p>
      </footer>

      <MobileFilterSheet 
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        lang={lang}
        sortBy={sortBy} setSortBy={setSortBy}
        timeRange={timeRange} setTimeRange={setTimeRange}
        selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
        categories={categories}
        filterCounts={filterCounts}
      />

      {selectedBlueprint && (
        <BlueprintDetail 
          blueprint={selectedBlueprint}
          detailData={detailData}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedBlueprint(null)}
          onOpenImageViewer={() => setIsImageViewerOpen(true)}
          lang={lang}
        />
      )}

      {isImageViewerOpen && selectedBlueprint && (
        <BlueprintImageViewer 
          src={selectedBlueprint.imageMain}
          alt={selectedBlueprint.n}
          onClose={() => setIsImageViewerOpen(false)}
        />
      )}
    </div>
  );
};

export default App;