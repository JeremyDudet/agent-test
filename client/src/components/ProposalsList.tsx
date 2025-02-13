import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Edit, Clock } from 'lucide-react';
import { Proposal } from '../types';

interface ProposalsListProps {
  proposals: Proposal[];
  onApprove: (proposal: Proposal) => void;
  onReject: (proposal: Proposal) => void;
  onEdit: (proposal: Proposal) => void;
  categories: { id: string; name: string }[];
}

export function ProposalsList({ proposals, onApprove, onReject, onEdit, categories }: ProposalsListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_review':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'confirmed':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'rejected':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return '';
    }
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          Expense Proposals
        </h2>
        <Badge variant="secondary" className="text-base">
          {proposals.length} pending
        </Badge>
      </div>
      
      {proposals.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No pending expense proposals. Start speaking to create some!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <Card key={proposal.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle>{proposal.merchant}</CardTitle>
                    <CardDescription>{proposal.description}</CardDescription>
                  </div>
                  <span className="text-xl font-bold">
                    {formatAmount(proposal.amount)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 opacity-70" />
                      <span>{formatDate(proposal.date)}</span>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={getStatusColor(proposal.status || 'pending_review')}
                    >
                      {proposal.status || 'Pending Review'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(proposal)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onReject(proposal)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onApprove(proposal)}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
