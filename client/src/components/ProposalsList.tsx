import React from 'react';
import { Stack, Text, Button, Card, Group, Badge, NumberFormatter, ActionIcon, Modal, TextInput, Select } from '@mantine/core';
import { IconCheck, IconX, IconEdit, IconClock } from '@tabler/icons-react';
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
        return 'yellow';
      case 'confirmed':
        return 'green';
      case 'rejected':
        return 'red';
      default:
        return 'gray';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Stack>
      <Group position="apart" mb="md">
        <Text size="xl" fw={700}>
          Expense Proposals
        </Text>
        <Badge size="lg" variant="light" color="blue">
          {proposals.length} pending
        </Badge>
      </Group>
      
      {proposals.length === 0 ? (
        <Card withBorder p="xl" radius="md">
          <Text c="dimmed" ta="center">
            No pending expense proposals. Start speaking to create some!
          </Text>
        </Card>
      ) : (
        proposals.map((proposal) => (
          <Card key={proposal.id} withBorder shadow="sm" radius="md" p="md">
            <Group position="apart" mb="xs">
              <Group>
                <Text fw={500} size="lg">
                  {proposal.merchant || 'Unnamed Expense'}
                </Text>
                <Badge color={getStatusColor(proposal.status)}>
                  {proposal.status === 'pending_review' ? (
                    <Group spacing={4}>
                      <IconClock size={14} />
                      <Text>Pending Review</Text>
                    </Group>
                  ) : (
                    proposal.status
                  )}
                </Badge>
              </Group>
              <Text fw={700} size="xl">
                <NumberFormatter
                  value={proposal.amount}
                  prefix="$"
                  decimalScale={2}
                  fixedDecimalScale
                />
              </Text>
            </Group>
            
            <Group spacing="xl" mb="md">
              <Text c="dimmed" size="sm">
                Date: {formatDate(proposal.date)}
              </Text>
              <Text c="dimmed" size="sm">
                Category: {proposal.category}
              </Text>
              {proposal.description && (
                <Text c="dimmed" size="sm">
                  Note: {proposal.description}
                </Text>
              )}
            </Group>

            <Group position="right" spacing="xs">
              <ActionIcon
                variant="light"
                color="green"
                size="lg"
                onClick={() => onApprove(proposal)}
                title="Approve"
              >
                <IconCheck size={20} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                color="blue"
                size="lg"
                onClick={() => onEdit(proposal)}
                title="Edit"
              >
                <IconEdit size={20} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                color="red"
                size="lg"
                onClick={() => onReject(proposal)}
                title="Reject"
              >
                <IconX size={20} />
              </ActionIcon>
            </Group>
          </Card>
        ))
      )}
    </Stack>
  );
}
