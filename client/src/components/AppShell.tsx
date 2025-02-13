import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import useStore from '../store/useStore';
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import { 
  LayoutDashboard, 
  Receipt, 
  Settings,
  History,
  Star,
  FileText,
  Building2,
  ChevronDown,
  PlayCircle,
  Briefcase,
  Plane,
  MoreHorizontal,
  Menu,
  X
} from 'lucide-react';

const SidebarLink = ({ 
  to, 
  icon: Icon, 
  children, 
  onClose 
}: { 
  to: string; 
  icon: React.ElementType; 
  children: React.ReactNode;
  onClose?: () => void;
}) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  const handleClick = () => {
    if (window.innerWidth < 1024) {
      onClose?.();
    }
  };
  
  return (
    <Link
      to={to}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-accent",
        isActive ? "bg-accent" : "transparent"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{children}</span>
    </Link>
  );
};

const Sidebar = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { user, logout } = useStore();
  
  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden",
          isOpen ? "block" : "hidden"
        )}
        onClick={onClose}
      />
      
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[hsl(var(--background))] border-r shadow-lg transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
        !isOpen && "-translate-x-full"
      )}>
        {/* Organization Selector */}
        <div className="flex items-center justify-between border-b p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>Acme Inc</span>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem>
                <Building2 className="mr-2 h-4 w-4" />
                <span>Switch Organization</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex-1 space-y-1 p-4">
          <div className="mb-4">
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">Main</h2>
            <div className="space-y-1">
              <SidebarLink to="/dashboard" icon={LayoutDashboard} onClose={onClose}>Dashboard</SidebarLink>
              <SidebarLink to="/expenses" icon={Receipt} onClose={onClose}>Expenses</SidebarLink>
            </div>
          </div>

          <div className="mb-4">
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">Settings</h2>
            <div className="space-y-1">
              <Link 
                to="/settings" 
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    onClose();
                  }
                }}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </div>
          </div>
        </div>

        {/* User Section */}
        <div className="border-t p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-accent" />
                  <div className="flex flex-col items-start text-sm">
                    <span>shadcn</span>
                    <span className="text-xs text-muted-foreground">m@example.com</span>
                  </div>
                </div>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">Log Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
};

const AppShell: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);

  React.useEffect(() => {
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <main className="flex-1">
        <div className="flex h-[73px] items-center gap-4 border-b bg-background px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        <div className="flex-1 space-y-4 p-8 pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppShell;
