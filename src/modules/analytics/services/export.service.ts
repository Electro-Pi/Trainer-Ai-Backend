import ExcelJS from 'exceljs';

import { pdfRendererService } from '@/modules/reports/reports.module.js';

import type {
  OrganizationPerformanceResponseDto,
  TeamPerformanceResponseDto,
} from '../dto/analytics.dto.js';
import {
  renderOrganizationPerformanceHtml,
  renderTeamPerformanceHtml,
} from '../templates/performance-export.template.js';

import { performanceService } from './performance.service.js';

export interface ExportQuery {
  format: 'pdf' | 'xlsx';
  scope: 'team' | 'organization';
  teamId?: string;
}

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function buildTeamWorkbook(data: TeamPerformanceResponseDto): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MODRB';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Team Performance');
  sheet.columns = [
    { header: 'Learner', key: 'displayName', width: 28 },
    { header: 'Track (EN)', key: 'trackNameEn', width: 22 },
    { header: 'Level (EN)', key: 'levelNameEn', width: 22 },
    { header: 'Sessions attended', key: 'sessionsAttended', width: 16 },
    { header: 'Sessions scheduled', key: 'sessionsScheduled', width: 16 },
    { header: 'Average score', key: 'averageScore', width: 14 },
    { header: 'Outcomes achieved', key: 'outcomesAchieved', width: 16 },
    { header: 'Outcomes total', key: 'outcomesTotal', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(data.learners);
  return workbook;
}

function buildOrganizationWorkbook(data: OrganizationPerformanceResponseDto): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MODRB';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Organization Performance');
  sheet.columns = [
    { header: 'Team', key: 'teamName', width: 28 },
    { header: 'Learners', key: 'learnerCount', width: 12 },
    { header: 'Average score', key: 'averageScore', width: 14 },
    { header: 'Outcome achievement rate', key: 'outcomeAchievementRate', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(data.teams);
  return workbook;
}

/** `PF-08` — exports either scope as PDF (Playwright, reusing the reports renderer) or XLSX (exceljs), streamed back inline rather than persisted like `Report` rows. */
export class ExportService {
  async export(query: ExportQuery): Promise<ExportResult> {
    const timestamp = new Date().toISOString().slice(0, 10);

    if (query.scope === 'team') {
      if (!query.teamId) throw new Error('teamId is required for scope=team');
      const data = await performanceService.teamPerformance(query.teamId);

      if (query.format === 'pdf') {
        const buffer = await pdfRendererService.renderPdf(renderTeamPerformanceHtml(data));
        return {
          buffer,
          contentType: 'application/pdf',
          filename: `team-performance-${query.teamId}-${timestamp}.pdf`,
        };
      }

      const workbook = buildTeamWorkbook(data);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `team-performance-${query.teamId}-${timestamp}.xlsx`,
      };
    }

    const data = await performanceService.organizationPerformance();

    if (query.format === 'pdf') {
      const buffer = await pdfRendererService.renderPdf(renderOrganizationPerformanceHtml(data));
      return {
        buffer,
        contentType: 'application/pdf',
        filename: `organization-performance-${timestamp}.pdf`,
      };
    }

    const workbook = buildOrganizationWorkbook(data);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `organization-performance-${timestamp}.xlsx`,
    };
  }
}

export const exportService = new ExportService();
