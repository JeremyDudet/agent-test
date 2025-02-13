import React, { useEffect, useState } from 'react';
import useStore from '../store/useStore';
import { useAuth } from '../components/AuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Tags, Search, ChevronDown, Filter, Check } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from '@/lib/supabase';
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  merchant: string;
  date_created: string;
}

interface ExpenseSummary {
  total: number;
  byCategory: { [key: string]: number };
}

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'merchant'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [summary, setSummary] = useState<ExpenseSummary>({ total: 0, byCategory: {} });
  const itemsPerPage = 10;
  const { user } = useStore();
  const { session } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetchExpenses = async () => {
      try {
        setIsLoading(true);
        
        // First, fetch categories to get their names
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name');

        if (categoriesError) throw categoriesError;

        const categoryMap = new Map(categoriesData.map(cat => [cat.id, cat.name]));

        // Then fetch expenses with category information
        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select('id, amount, description, category_id, date, merchant, date_created')
          .eq('user_id', session?.user?.id)
          .order('date', { ascending: false });

        if (expensesError) throw expensesError;

        // Map the expenses data to include category names
        const mappedExpenses = expensesData.map(expense => ({
          ...expense,
          category: categoryMap.get(expense.category_id) || 'Uncategorized',
        }));

        setExpenses(mappedExpenses);
        calculateSummary(mappedExpenses);
      } catch (error) {
        console.error('Error fetching expenses:', error);
        toast({
          title: "Error",
          description: "Failed to load expenses. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (session?.user?.id) {
      fetchExpenses();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    let result = [...expenses];

    // Apply category filter
    if (selectedCategory !== 'all') {
      result = result.filter(expense => expense.category === selectedCategory);
    }

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(expense => 
        expense.description.toLowerCase().includes(term) ||
        expense.merchant.toLowerCase().includes(term) ||
        expense.category.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === 'amount') {
        comparison = a.amount - b.amount;
      } else if (sortBy === 'merchant') {
        comparison = a.merchant.localeCompare(b.merchant);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    setFilteredExpenses(result);
  }, [expenses, searchTerm, sortBy, sortOrder, selectedCategory]);

  const calculateSummary = (data: Expense[]) => {
    const summary = data.reduce((acc, expense) => {
      acc.total += expense.amount;
      acc.byCategory[expense.category] = (acc.byCategory[expense.category] || 0) + expense.amount;
      return acc;
    }, { total: 0, byCategory: {} } as ExpenseSummary);
    setSummary(summary);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const categories = Array.from(new Set(expenses.map(e => e.category)));
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex flex-col space-y-1.5">
          <h1 className="text-3xl font-bold">Expenses History</h1>
          <p className="text-muted-foreground">View and manage your approved expenses</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatAmount(summary.total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Number of Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{expenses.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Categories Used</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{categories.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Input
                placeholder="Search expenses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10"
              />
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-[180px]">
                Sort by {sortBy} <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuItem onClick={() => setSortBy('date')}>
                Date {sortBy === 'date' && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('amount')}>
                Amount {sortBy === 'amount' && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('merchant')}>
                Merchant {sortBy === 'merchant' && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
                {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="pt-6 text-center">
              Loading expenses...
            </CardContent>
          </Card>
        ) : paginatedExpenses.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No expenses found matching your criteria.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedExpenses.map((expense) => (
                <Card key={expense.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-1">
                        <h3 className="font-medium text-lg">
                          {expense.merchant}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {expense.description}
                        </p>
                      </div>
                      <p className="text-xl font-bold">
                        {formatAmount(expense.amount)}
                      </p>
                    </div>

                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 opacity-70" />
                        <span>{formatDate(expense.date)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tags className="h-4 w-4 opacity-70" />
                        <span>{expense.category}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-4">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 