import { BaseView } from './BaseView';
import type { BaseResponseDTO, PaginatedResponseDTO } from './BaseView';
import type { Expense } from '../types/index';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';

export interface ExpenseResponseDTO {
  id: string;
  amount: string;
  date: string;
  category: string;
  item: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export class ExpenseView extends BaseView<Expense, ExpenseResponseDTO> {
  constructor(
    private readonly locale: string = 'en-US',
    private readonly currency: string = 'USD'
  ) {
    super();
  }

  format(expense: Expense): ExpenseResponseDTO {
    return {
      id: expense.id,
      amount: this.formatCurrency(expense.amount, this.currency, this.locale),
      date: this.formatDate(expense.date),
      category: expense.category,
      item: expense.item,
      description: expense.description,
      created_at: this.formatDate(expense.created_at),
      updated_at: this.formatDate(expense.updated_at)
    };
  }

  formatSingle(expense: Expense, startTime?: number): BaseResponseDTO<ExpenseResponseDTO> {
    return this.formatResponse(this.format(expense), startTime);
  }

  formatList(
    expenses: Expense[],
    total: number,
    page: number,
    limit: number,
    startTime?: number
  ): PaginatedResponseDTO<ExpenseResponseDTO> {
    return this.formatPaginatedResponse(
      expenses.map(expense => this.format(expense)),
      total,
      page,
      limit,
      startTime
    );
  }

  formatCSV(expenses: Expense[]): string {
    const fields = ['date', 'item', 'amount', 'category', 'description'];
    const parser = new Parser({ fields });

    const data = expenses.map(expense => ({
      date: this.formatDate(expense.date, 'yyyy-MM-dd'),
      item: expense.item,
      amount: expense.amount.toString(),
      category: expense.category,
      description: expense.description || ''
    }));

    return parser.parse(data);
  }

  formatPDF(expenses: Expense[]): Buffer {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: unknown) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    });
    
    // Add header
    doc.fontSize(16).text('Expense Report', { align: 'center' });
    doc.moveDown();

    // Add table header
    const tableTop = 150;
    const columns = {
      date: { x: 50, width: 100 },
      item: { x: 150, width: 150 },
      amount: { x: 300, width: 100 },
      category: { x: 400, width: 100 }
    };

    Object.entries(columns).forEach(([title, { x }]) => {
      doc.fontSize(12)
         .text(title.toUpperCase(), x, tableTop, { width: 100 });
    });

    // Add expenses
    let y = tableTop + 30;
    expenses.forEach(expense => {
      if (y > 700) { // Start new page if near bottom
        doc.addPage();
        y = 50;
      }

      doc.fontSize(10)
         .text(this.formatDate(expense.date, 'MM/dd/yyyy'), columns.date.x, y)
         .text(expense.item, columns.item.x, y)
         .text(this.formatCurrency(expense.amount), columns.amount.x, y)
         .text(expense.category, columns.category.x, y);

      y += 20;
    });

    // Add summary
    doc.moveDown()
       .fontSize(12)
       .text(`Total Expenses: ${this.formatCurrency(
         expenses.reduce((sum, exp) => sum + exp.amount, 0)
       )}`, 50);

    doc.end();

    return Buffer.concat(chunks as Buffer[]);
  }
} 