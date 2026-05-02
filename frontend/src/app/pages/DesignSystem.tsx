import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Alert } from "../components/examples/Alert";
import { EmptyState } from "../components/examples/EmptyState";
import {
  Skeleton,
  TextLineSkeleton,
  ParagraphSkeleton,
  MetricCardSkeleton,
  CardSkeleton,
  StockTableSkeleton,
  ChartSkeleton,
} from "../components/examples/LoadingSkeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/examples/Tabs";
import {
  Search,
  Download,
  AlertCircle,
  FileX,
  Plus,
  Settings,
  TrendingUp,
} from "lucide-react";

/**
 * DesignSystem Page
 * 
 * A comprehensive showcase of all TradexaLK design system components.
 * Use this page as a reference for implementing consistent UI patterns.
 * 
 * This page is for development/documentation purposes only.
 */
export function DesignSystem() {
  const [showAlert, setShowAlert] = useState(true);
  const [activeTab, setActiveTab] = useState("colors");

  return (
    <div className="min-h-screen bg-[#0a0e14] p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-50 tracking-tight">
            TradexaLK Design System
          </h1>
          <p className="text-sm text-slate-500">
            A comprehensive design system for professional financial analytics platforms
          </p>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="colors">Colors</TabsTrigger>
            <TabsTrigger value="typography">Typography</TabsTrigger>
            <TabsTrigger value="buttons">Buttons</TabsTrigger>
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="badges">Badges</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="empty">Empty States</TabsTrigger>
            <TabsTrigger value="loading">Loading</TabsTrigger>
          </TabsList>

          {/* Colors Tab */}
          <TabsContent value="colors">
            <div className="space-y-6">
              {/* Background Colors */}
              <Card className="bg-[#111823] border-[#1e2938]">
                <CardHeader>
                  <CardTitle className="text-lg">Background Colors</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-[#0a0e14] border border-[#1e2938]" />
                    <div className="text-xs font-mono text-slate-400">--bg-primary</div>
                    <div className="text-xs text-slate-500">#0a0e14</div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-[#111823] border border-[#1e2938]" />
                    <div className="text-xs font-mono text-slate-400">--bg-secondary</div>
                    <div className="text-xs text-slate-500">#111823</div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-[#1e2938] border border-[#1e2938]" />
                    <div className="text-xs font-mono text-slate-400">--bg-tertiary</div>
                    <div className="text-xs text-slate-500">#1e2938</div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-[#0f1419] border border-[#1e2938]" />
                    <div className="text-xs font-mono text-slate-400">--bg-elevated</div>
                    <div className="text-xs text-slate-500">#0f1419</div>
                  </div>
                </CardContent>
              </Card>

              {/* Semantic Colors */}
              <Card className="bg-[#111823] border-[#1e2938]">
                <CardHeader>
                  <CardTitle className="text-lg">Semantic Colors</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-semibold">
                      Success
                    </div>
                    <div className="text-xs font-mono text-slate-400">--success-base</div>
                    <div className="text-xs text-slate-500">#10b981</div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-red-600 flex items-center justify-center text-white font-semibold">
                      Danger
                    </div>
                    <div className="text-xs font-mono text-slate-400">--danger-base</div>
                    <div className="text-xs text-slate-500">#ef4444</div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-amber-600 flex items-center justify-center text-white font-semibold">
                      Warning
                    </div>
                    <div className="text-xs font-mono text-slate-400">--warning-base</div>
                    <div className="text-xs text-slate-500">#f59e0b</div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-20 rounded-lg bg-blue-600 flex items-center justify-center text-white font-semibold">
                      Info
                    </div>
                    <div className="text-xs font-mono text-slate-400">--info-base</div>
                    <div className="text-xs text-slate-500">#3b82f6</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Typography Tab */}
          <TabsContent value="typography">
            <Card className="bg-[#111823] border-[#1e2938]">
              <CardHeader>
                <CardTitle className="text-lg">Typography Scale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-xs text-slate-500 mb-2">Display (36px)</div>
                  <div className="text-4xl font-bold text-slate-50">
                    Market Dashboard
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Heading 1 (30px)</div>
                  <h1 className="text-3xl font-bold text-slate-50">Stock Screener</h1>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Heading 2 (24px)</div>
                  <h2 className="text-2xl font-semibold text-slate-50">
                    Market Overview
                  </h2>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Heading 3 (20px)</div>
                  <h3 className="text-xl font-semibold text-slate-50">
                    Technical Analysis
                  </h3>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Heading 4 (16px)</div>
                  <h4 className="text-base font-semibold text-slate-50">
                    Key Metrics
                  </h4>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Body (14px)</div>
                  <p className="text-sm text-slate-300">
                    This is body text used for most content throughout the application.
                  </p>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Small (12px)</div>
                  <p className="text-xs text-slate-400">
                    Small text used for captions and labels.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Buttons Tab */}
          <TabsContent value="buttons">
            <Card className="bg-[#111823] border-[#1e2938]">
              <CardHeader>
                <CardTitle className="text-lg">Button Variants</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Primary Buttons */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">Primary</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button className="bg-emerald-600 hover:bg-emerald-700">
                      Primary Button
                    </Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" disabled>
                      Disabled
                    </Button>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                      Small
                    </Button>
                    <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700">
                      Large
                    </Button>
                  </div>
                </div>

                {/* Secondary Buttons */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">Secondary</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      className="bg-[#1e2938] hover:bg-[#334155]"
                    >
                      Secondary Button
                    </Button>
                    <Button variant="secondary" disabled>
                      Disabled
                    </Button>
                  </div>
                </div>

                {/* Outline Buttons */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">Outline</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline">Outline Button</Button>
                    <Button variant="outline" disabled>
                      Disabled
                    </Button>
                  </div>
                </div>

                {/* Ghost Buttons */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">Ghost</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="ghost">Ghost Button</Button>
                    <Button variant="ghost" disabled>
                      Disabled
                    </Button>
                  </div>
                </div>

                {/* Danger Buttons */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">Danger</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="destructive">Delete</Button>
                    <Button variant="destructive" disabled>
                      Disabled
                    </Button>
                  </div>
                </div>

                {/* Icon Buttons */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300">With Icons</h3>
                  <div className="flex flex-wrap gap-3">
                    <Button className="bg-emerald-600 hover:bg-emerald-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Stock
                    </Button>
                    <Button variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button variant="outline">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inputs Tab */}
          <TabsContent value="inputs">
            <Card className="bg-[#111823] border-[#1e2938]">
              <CardHeader>
                <CardTitle className="text-lg">Input Variants</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Default Input</label>
                  <Input
                    placeholder="Enter symbol or company name..."
                    className="bg-[#0a0e14] border-[#1e2938]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Input with Icon</label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      placeholder="Search stocks..."
                      className="pl-10 bg-[#0a0e14] border-[#1e2938]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Error State</label>
                  <Input
                    placeholder="Invalid input"
                    className="bg-[#0a0e14] border-red-500"
                  />
                  <p className="text-xs text-red-400">This field is required</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Disabled Input</label>
                  <Input
                    placeholder="Disabled"
                    disabled
                    className="bg-[#111823] border-[#1e2938]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Input Sizes</label>
                  <div className="space-y-3">
                    <Input
                      placeholder="Small (h-8)"
                      className="h-8 bg-[#0a0e14] border-[#1e2938]"
                    />
                    <Input
                      placeholder="Medium (h-10) - Default"
                      className="bg-[#0a0e14] border-[#1e2938]"
                    />
                    <Input
                      placeholder="Large (h-11)"
                      className="h-11 bg-[#0a0e14] border-[#1e2938]"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cards Tab */}
          <TabsContent value="cards">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-[#111823] border-[#1e2938]">
                <CardHeader className="border-b border-[#1e2938]">
                  <CardTitle className="text-base">Default Card</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-300">
                    Standard card with header and content sections.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-[#111823] border-[#1e2938] shadow-lg">
                <CardHeader className="border-b border-[#1e2938]">
                  <CardTitle className="text-base">Elevated Card</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-300">
                    Card with elevated shadow for emphasis.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-[#111823] border-[#1e2938] hover:bg-[#1e2938] transition-colors cursor-pointer">
                <CardHeader className="border-b border-[#1e2938]">
                  <CardTitle className="text-base">Interactive Card</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-300">
                    Hover over this card to see the interaction.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-transparent border-2 border-[#1e2938]">
                <CardHeader className="border-b border-[#1e2938]">
                  <CardTitle className="text-base">Outlined Card</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-300">
                    Card with outline style and no background.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Badges Tab */}
          <TabsContent value="badges">
            <Card className="bg-[#111823] border-[#1e2938]">
              <CardHeader>
                <CardTitle className="text-lg">Badge Variants</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">Solid Badges</h3>
                  <div className="flex flex-wrap gap-3">
                    <Badge className="bg-[#1e2938] text-slate-300">Default</Badge>
                    <Badge className="bg-emerald-600 text-white">Success</Badge>
                    <Badge className="bg-red-600 text-white">Danger</Badge>
                    <Badge className="bg-amber-600 text-white">Warning</Badge>
                    <Badge className="bg-blue-600 text-white">Info</Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">Outline Badges</h3>
                  <div className="flex flex-wrap gap-3">
                    <Badge
                      variant="outline"
                      className="border-[#1e2938] text-slate-300 bg-transparent"
                    >
                      Default
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-emerald-600/30 bg-emerald-600/10 text-emerald-400"
                    >
                      Success
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-red-600/30 bg-red-600/10 text-red-400"
                    >
                      Danger
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-amber-600/30 bg-amber-600/10 text-amber-400"
                    >
                      Warning
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-blue-600/30 bg-blue-600/10 text-blue-400"
                    >
                      Info
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">Financial Badges</h3>
                  <div className="flex flex-wrap gap-3">
                    <Badge className="bg-emerald-600 text-white">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Bullish
                    </Badge>
                    <Badge className="bg-red-600 text-white">
                      <TrendingUp className="h-3 w-3 mr-1 rotate-180" />
                      Bearish
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-emerald-600/30 bg-emerald-600/10 text-emerald-400"
                    >
                      JKH.N0000
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts">
            <div className="space-y-6">
              {showAlert && (
                <Alert
                  variant="info"
                  title="Information"
                  message="This is an informational message to notify users about updates."
                  dismissible
                  onDismiss={() => setShowAlert(false)}
                />
              )}
              <Alert
                variant="success"
                title="Success"
                message="Your changes have been saved successfully."
              />
              <Alert
                variant="warning"
                title="Warning"
                message="Your session will expire in 5 minutes. Please save your work."
              />
              <Alert
                variant="danger"
                title="Error"
                message="Unable to connect to the server. Please check your connection."
              />
            </div>
          </TabsContent>

          {/* Empty States Tab */}
          <TabsContent value="empty">
            <div className="space-y-8">
              <Card className="bg-[#111823] border-[#1e2938]">
                <CardContent>
                  <EmptyState
                    icon={FileX}
                    title="No stocks found"
                    description="Try adjusting your filters to see more results"
                    actionLabel="Reset Filters"
                    onAction={() => alert("Filters reset!")}
                  />
                </CardContent>
              </Card>

              <Card className="bg-[#111823] border-[#1e2938]">
                <CardContent>
                  <EmptyState
                    icon={AlertCircle}
                    title="No data available"
                    description="We couldn't load the data. Please try again later."
                    size="sm"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Loading Tab */}
          <TabsContent value="loading">
            <div className="space-y-6">
              <Card className="bg-[#111823] border-[#1e2938]">
                <CardHeader>
                  <CardTitle className="text-lg">Text Skeletons</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <TextLineSkeleton width="full" />
                    <TextLineSkeleton width="3/4" />
                    <TextLineSkeleton width="1/2" />
                  </div>
                  <ParagraphSkeleton lines={4} />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CardSkeleton />
                <ChartSkeleton />
              </div>

              <StockTableSkeleton rows={5} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
