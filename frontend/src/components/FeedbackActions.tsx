import { Bug, Suggestion } from 'iconoir-react';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { Tooltip } from './Tooltip';
import './FeedbackActions.css';

interface FeedbackActionsProps {
  className?: string;
}

const suggestionUrl = 'https://github.com/bnquon/orson/issues/new?template=feature_request.yml';
const bugReportUrl = 'https://github.com/bnquon/orson/issues/new?template=bug_report.yml';

export function FeedbackActions({ className = '' }: FeedbackActionsProps) {
  return (
    <div className={`feedback-actions${className ? ` ${className}` : ''}`}>
      <Tooltip
        label="Suggest an improvement"
        content="Suggest an improvement"
        interactive
        placement="bottom"
        onClick={() => BrowserOpenURL(suggestionUrl)}
      >
        <Suggestion width={16} height={16} aria-hidden="true" />
      </Tooltip>
      <Tooltip
        label="Report a bug"
        content="Report a bug"
        interactive
        placement="bottom"
        onClick={() => BrowserOpenURL(bugReportUrl)}
      >
        <Bug width={16} height={16} aria-hidden="true" />
      </Tooltip>
    </div>
  );
}
