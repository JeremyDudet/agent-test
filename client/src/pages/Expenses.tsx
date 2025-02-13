import React, { useEffect, useState } from 'react';
import useStore from '../store/useStore';
import { useAuth } from '../components/AuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Tags } from 'lucide-react';

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  merchant: string;
  date_created: string;
}

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useStore();
  const { session } = useAuth();

  useEffect(() => {
    const fetchExpenses = async () => {
      try {
        const response = await fetch('/api/expenses', {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch expenses');
        }
        
        const data = await response.json();
        setExpenses(data);
      } catch (error) {
        console.error('Error fetching expenses:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session?.access_token) {
      fetchExpenses();
    }
  }, [session?.access_token]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex flex-col space-y-1.5">
          <h1 className="text-3xl font-bold">Expenses History</h1>
          <p className="text-muted-foreground">View and manage your approved expenses</p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="pt-6 text-center">
              Loading expenses...
            </CardContent>
          </Card>
        ) : expenses.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No approved expenses yet. Start by recording some expenses in the dashboard!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {expenses.map((expense) => (
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
        )}
      </div>
    </div>
  );
} 